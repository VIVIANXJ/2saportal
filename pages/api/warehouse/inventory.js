/**
 * /api/warehouse/inventory
 * 直接调用两个仓库，不做内部 fetch 转发
 */

import crypto from 'crypto';
import xml2js from 'xml2js';

// ── ECCANG ──────────────────────────────────────────────────
async function fetchEccang(skuList) {
  const BASE_URL       = process.env.ECCANG_BASE_URL;
  const APP_TOKEN      = process.env.ECCANG_APP_TOKEN;
  const APP_KEY        = process.env.ECCANG_APP_KEY;
  const WAREHOUSE_CODE = process.env.ECCANG_WAREHOUSE_CODE || 'AUSYD';

  if (!BASE_URL || !APP_TOKEN || !APP_KEY) {
    return { error: 'ECCANG credentials not configured' };
  }

  const paramsJson = { page: 1, pageSize: '50', warehouse_code: WAREHOUSE_CODE };
  if (skuList?.length === 1) paramsJson.product_sku = skuList[0];
  if (skuList?.length > 1)  paramsJson.product_sku_arr = skuList;

  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://www.example.org/Ec/">
  <SOAP-ENV:Body>
    <ns1:callService>
      <paramsJson>${JSON.stringify(paramsJson)}</paramsJson>
      <appToken>${APP_TOKEN}</appToken>
      <appKey>${APP_KEY}</appKey>
      <service>getProductInventory</service>
    </ns1:callService>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=UTF-8', 'SOAPAction': '' },
      body: soap,
    });
    const xml = await res.text();
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
    const result = await parser.parseStringPromise(xml);
    const envelope = result['SOAP-ENV:Envelope'] || result['soapenv:Envelope'];
    const body     = envelope['SOAP-ENV:Body']   || envelope['soapenv:Body'];
    const response = body['ns1:callServiceResponse']?.response || body['callServiceResponse']?.response;
    const data = JSON.parse(response);

    if (data.ask !== 'Success') return { error: data.message || 'ECCANG error' };

    const items = Array.isArray(data.data) ? data.data : (data.data ? [data.data] : []);
    return {
      success: true,
      data: items.map(item => ({
        sku:        item.product_sku,
        warehouse:  'ECCANG',
        sellable:   parseInt(item.sellable)   || 0,
        reserved:   parseInt(item.reserved)   || 0,
        onway:      parseInt(item.onway)       || 0,
        unsellable: parseInt(item.unsellable)  || 0,
        hold:       parseInt(item.hold)        || 0,
      }))
    };
  } catch (e) {
    return { error: e.message };
  }
}

// ── JDL ─────────────────────────────────────────────────────
async function fetchJdl(skuList) {
  const BASE_URL     = process.env.JDL_BASE_URL || 'https://intl-api.jdl.com';
  const APP_KEY      = process.env.JDL_APP_KEY;
  const APP_SECRET   = process.env.JDL_APP_SECRET;
  const ACCESS_TOKEN = process.env.JDL_ACCESS_TOKEN;

  if (!ACCESS_TOKEN || !APP_KEY || !APP_SECRET) {
    return { error: 'JDL credentials not configured' };
  }

  const timestamp = new Date(Date.now() + 8 * 3600 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);

  // body 参数
  const body = { pageNum: 1, pageSize: 50 };
  if (skuList?.length) body.customerGoodsIdList = skuList;

  // 签名只包含 URL 参数，body 参数不参与签名
  const signParams = {
    app_key:      APP_KEY,
    access_token: ACCESS_TOKEN,
    timestamp,
    v:            '2.0',
  };

  const content = APP_SECRET
    + Object.keys(signParams).sort().map(k => `${k}${signParams[k]}`).join('')
    + APP_SECRET;
  const sign = crypto.createHash('md5').update(content, 'utf8').digest('hex').toUpperCase();

  // 构建 URL，LOP-DN 只加到 URL，不参与签名
  const url = new URL('/fop/open/stockprovider/querystockwarehouselistbypage', BASE_URL);
  url.searchParams.set('app_key',      APP_KEY);
  url.searchParams.set('access_token', ACCESS_TOKEN);
  url.searchParams.set('timestamp',    timestamp);
  url.searchParams.set('v',            '2.0');
  url.searchParams.set('sign',         sign);
  url.searchParams.set('LOP-DN',       'FOP');

  try {
    const res = await fetch(url.toString(), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) return { error: `JDL HTTP ${res.status}: ${text.slice(0, 200)}` };

    const data = JSON.parse(text);
    if (data.code !== 200 && data.code !== '200') {
      return { error: data.message || `JDL code ${data.code}` };
    }

    const records = data.data?.records || [];
    return {
      success: true,
      data: records.map(item => ({
        sku:        item.customerGoodsId,
        warehouse:  'JDL',
        sellable:   item.stockQuantity               || 0,
        reserved:   item.preoccupiedQuantity         || 0,
        onway:      item.purchaseWaitinStockQuantity  || 0,
        unsellable: item.defectiveQty                || 0,
        hold:       item.lockQty                     || 0,
      }))
    };
  } catch (e) {
    return { error: e.message };
  }
}

// ── Handler ──────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { sku, warehouse } = req.query;
  const skuList = sku ? sku.split(',').map(s => s.trim()).filter(Boolean) : null;

  const queryJdl    = !warehouse || warehouse.toUpperCase() === 'JDL';
  const queryEccang = !warehouse || warehouse.toUpperCase() === 'ECCANG';

  const [jdlResult, eccangResult] = await Promise.all([
    queryJdl    ? fetchJdl(skuList)    : Promise.resolve(null),
    queryEccang ? fetchEccang(skuList) : Promise.resolve(null),
  ]);

  // 按 SKU 合并
  const skuMap = {};
  const merge = (result, whName) => {
    if (!result?.data) return;
    for (const item of result.data) {
      if (!item.sku) continue;
      if (!skuMap[item.sku]) skuMap[item.sku] = { sku: item.sku, warehouses: {} };
      skuMap[item.sku].warehouses[whName] = {
        sellable:   item.sellable,
        reserved:   item.reserved,
        onway:      item.onway,
        unsellable: item.unsellable,
        hold:       item.hold,
      };
    }
  };
  merge(jdlResult,    'JDL');
  merge(eccangResult, 'ECCANG');

  const combined = Object.values(skuMap).map(entry => ({
    ...entry,
    total_sellable: Object.values(entry.warehouses)
      .reduce((s, w) => s + (w.sellable || 0), 0),
  }));

  return res.status(200).json({
    success: true,
    data: combined,
    warehouses: {
      JDL:    jdlResult?.success    ? 'ok' : (jdlResult?.error    || 'not queried'),
      ECCANG: eccangResult?.success ? 'ok' : (eccangResult?.error || 'not queried'),
    },
  });
}
