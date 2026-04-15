/**
 * /api/warehouse/inventory
 * 直接调用两个仓库逻辑，不再用内部 fetch 转发
 */

import { buildEccangRequest, parseEccangResponse } from './_warehouse_helpers';

// 直接内联 ECCANG 调用逻辑
async function fetchEccang(skuList) {
  const ECCANG_BASE_URL = process.env.ECCANG_BASE_URL;
  const APP_TOKEN       = process.env.ECCANG_APP_TOKEN;
  const APP_KEY         = process.env.ECCANG_APP_KEY;
  const WAREHOUSE_CODE  = process.env.ECCANG_WAREHOUSE_CODE || 'AUSYD';

  if (!ECCANG_BASE_URL || !APP_TOKEN || !APP_KEY) {
    return { error: 'ECCANG credentials not configured' };
  }

  const paramsJson = { page: 1, pageSize: '50', warehouse_code: WAREHOUSE_CODE };
  if (skuList?.length === 1)  paramsJson.product_sku = skuList[0];
  if (skuList?.length > 1)    paramsJson.product_sku_arr = skuList;

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
    const res = await fetch(ECCANG_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=UTF-8', 'SOAPAction': '' },
      body: soap,
    });
    const xml = await res.text();

    // Parse XML response
    const responseMatch = xml.match(/<response>([\s\S]*?)<\/response>/);
    if (!responseMatch) return { error: 'Invalid ECCANG response' };
    const data = JSON.parse(responseMatch[1]);

    if (data.ask !== 'Success') return { error: data.message || 'ECCANG error' };

    const items = Array.isArray(data.data) ? data.data : (data.data ? [data.data] : []);
    return {
      success: true,
      data: items.map(item => ({
        sku:        item.product_sku,
        warehouse:  'ECCANG',
        sellable:   parseInt(item.sellable)  || 0,
        reserved:   parseInt(item.reserved)  || 0,
        onway:      parseInt(item.onway)     || 0,
        unsellable: parseInt(item.unsellable)|| 0,
        hold:       parseInt(item.hold)      || 0,
      }))
    };
  } catch (e) {
    return { error: e.message };
  }
}

// JDL 暂时返回空（token 待配置）
async function fetchJdl(skuList) {
  const ACCESS_TOKEN = process.env.JDL_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) return { error: 'JDL access_token not configured' };

  const crypto = await import('crypto');
  const APP_KEY    = process.env.JDL_APP_KEY;
  const APP_SECRET = process.env.JDL_APP_SECRET;
  const BASE_URL   = process.env.JDL_BASE_URL || 'https://api.jdl.com';

  const timestamp = new Date(Date.now() + 8*3600*1000).toISOString().replace('T',' ').slice(0,19);
  const urlParams = { app_key: APP_KEY, access_token: ACCESS_TOKEN, timestamp, v: '2.0' };

  const body = { pageNum: 1, pageSize: 50 };
  if (skuList?.length) body.customerGoodsIdList = skuList;

  const content = APP_SECRET + Object.keys({...urlParams,...body}).sort().map(k=>k+({...urlParams,...body})[k]).join('') + APP_SECRET;
  const sign = crypto.createHash('md5').update(content,'utf8').digest('hex').toUpperCase();

  const url = new URL('/fop/open/stockprovider/querystockwarehouselistbypage', BASE_URL);
  Object.entries({...urlParams, sign}).forEach(([k,v]) => url.searchParams.set(k,v));

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) return { error: `JDL HTTP ${res.status}` };
    const data = JSON.parse(text);
    if (data.code !== 200 && data.code !== '200') return { error: data.message || 'JDL error' };

    const records = data.data?.records || [];
    return {
      success: true,
      data: records.map(item => ({
        sku:        item.customerGoodsId,
        warehouse:  'JDL',
        sellable:   item.stockQuantity    || 0,
        reserved:   item.preoccupiedQuantity || 0,
        onway:      item.purchaseWaitinStockQuantity || 0,
        unsellable: item.defectiveQty     || 0,
        hold:       item.lockQty          || 0,
      }))
    };
  } catch (e) {
    return { error: e.message };
  }
}

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

  // Merge by SKU
  const skuMap = {};
  const process = (result, whName) => {
    if (!result?.data) return;
    for (const item of result.data) {
      if (!item.sku) continue;
      if (!skuMap[item.sku]) skuMap[item.sku] = { sku: item.sku, warehouses: {} };
      skuMap[item.sku].warehouses[whName] = {
        sellable: item.sellable, reserved: item.reserved,
        onway: item.onway, unsellable: item.unsellable, hold: item.hold,
      };
    }
  };
  process(jdlResult,    'JDL');
  process(eccangResult, 'ECCANG');

  const combined = Object.values(skuMap).map(entry => ({
    ...entry,
    total_sellable: Object.values(entry.warehouses).reduce((s, w) => s + (w.sellable||0), 0),
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
