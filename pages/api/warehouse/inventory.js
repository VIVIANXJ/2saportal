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
const JDL_WAREHOUSES = ['C0000001174', 'C0000001901'];

const JDL_STOCK_PATH       = '/fop/open/stockprovider/querystockwarehouselistbypage';
const JDL_BATCH_STOCK_PATH = '/fop/open/stockprovider/querystockbatchwarehouselistbypage';

async function jdlCallApi(apiPath, bodyObj) {
  const BASE_URL     = process.env.JDL_BASE_URL   || 'https://intl-api.jdl.com';
  const APP_KEY      = process.env.JDL_APP_KEY;
  const APP_SECRET   = process.env.JDL_APP_SECRET;
  const ACCESS_TOKEN = process.env.JDL_ACCESS_TOKEN;
  const timestamp    = new Date(Date.now() + 8 * 3600 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);
  const body = [bodyObj];

  const signMap = { access_token: ACCESS_TOKEN, app_key: APP_KEY, method: apiPath, param_json: JSON.stringify(body), timestamp, v: '2.0' };
  const signContent = APP_SECRET + Object.keys(signMap).sort().map(k => k + signMap[k]).join('') + APP_SECRET;
  const sign = crypto.createHash('md5').update(signContent, 'utf8').digest('hex').toUpperCase();

  const url = new URL(apiPath, BASE_URL);
  url.searchParams.set('app_key', APP_KEY);
  url.searchParams.set('access_token', ACCESS_TOKEN);
  url.searchParams.set('timestamp', timestamp);
  url.searchParams.set('v', '2.0');
  url.searchParams.set('sign', sign);
  url.searchParams.set('method', apiPath);
  url.searchParams.set('LOP-DN', 'JD_FOP_FULFILLMENT_CENTE');

  const res  = await fetch(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`JDL HTTP ${res.status}`);
  return JSON.parse(text);
}

async function fetchJdlWarehouse(skuList, warehouseCode) {
  const APP_KEY       = process.env.JDL_APP_KEY;
  const APP_SECRET    = process.env.JDL_APP_SECRET;
  const ACCESS_TOKEN  = process.env.JDL_ACCESS_TOKEN;
  const CUSTOMER_CODE = process.env.JDL_CUSTOMER_CODE || 'KH20000015945';

  if (!ACCESS_TOKEN || !APP_KEY || !APP_SECRET) return { error: 'JDL credentials not configured' };

  const baseBody = {
    page: 1, pageSize: 50,
    customerCode:    CUSTOMER_CODE,
    warehouseCode,
    operatorAccount: process.env.JDL_OPERATOR_ACCT || 'jdhk_ncwnsMgKPxSE',
    systemCode:      process.env.JDL_SYSTEM_CODE   || '2satest',
    systemType:      '10',
    cargoOwnerCode:  process.env.JDL_CARGO_OWNER_CODE || '',
  };
  if (skuList?.length) baseBody.customerGoodsIdList = skuList;

  // 同时调非批次 + 批次库存接口
  const [r1, r2] = await Promise.allSettled([
    jdlCallApi(JDL_STOCK_PATH,       { ...baseBody }),
    jdlCallApi(JDL_BATCH_STOCK_PATH, { ...baseBody }),
  ]);

  const skuMap = {};
  const addItems = (records) => {
    (records || []).forEach(item => {
      const sku = item.sku || item.customerGoodsId || item.jdGoodsId;
      if (!sku) return;
      if (!skuMap[sku]) skuMap[sku] = { sku, warehouse: 'JDL', warehouse_code: warehouseCode, sellable: 0, reserved: 0, onway: 0, unsellable: 0, hold: 0 };
      skuMap[sku].sellable += item.sellable ?? item.stockQuantity               ?? 0;
      skuMap[sku].reserved += item.reserved ?? item.preoccupiedQuantity         ?? 0;
      skuMap[sku].onway    += item.onway    ?? item.purchaseWaitinStockQuantity  ?? 0;
    });
  };

  console.log('[JDL inv.js] r1:', r1.status, r1.status==='fulfilled' ? JSON.stringify(r1.value).slice(0,300) : r1.reason?.message);
  console.log('[JDL inv.js] r2:', r2.status, r2.status==='fulfilled' ? JSON.stringify(r2.value).slice(0,300) : r2.reason?.message);

  let hasData = false;
  if (r1.status === 'fulfilled' && (r1.value.code === 200 || r1.value.code === '200')) { addItems(r1.value.data?.records); hasData = true; }
  if (r2.status === 'fulfilled' && (r2.value.code === 200 || r2.value.code === '200')) { addItems(r2.value.data?.records); hasData = true; }

  if (!hasData) {
    const msg = (r1.status === 'fulfilled' ? r1.value?.message : null)
             || (r2.status === 'fulfilled' ? r2.value?.message : null) || 'JDL error';
    return { error: msg };
  }

  return { success: true, data: Object.values(skuMap) };
}

async function fetchJdl(skuList) {
  // 并行查两个仓库
  const results = await Promise.allSettled(
    JDL_WAREHOUSES.map(wh => fetchJdlWarehouse(skuList, wh))
  );

  const allData = [];
  const errors  = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.success) {
      allData.push(...r.value.data);
    } else {
      const err = r.status === 'rejected' ? r.reason?.message : r.value?.error;
      errors.push(`${JDL_WAREHOUSES[i]}: ${err}`);
    }
  });

  if (allData.length === 0 && errors.length > 0) {
    return { error: errors.join(' | ') };
  }
  return { success: true, data: allData };
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

  // 按 SKU 合并，JDL 每个仓库单独一行，ECCANG 一行
  const skuMap = {};

  // JDL：每条记录有 warehouse_code，单独一行
  if (jdlResult?.data) {
    for (const item of jdlResult.data) {
      if (!item.sku) continue;
      if (!skuMap[item.sku]) skuMap[item.sku] = { sku: item.sku, warehouses: {} };
      const key = item.warehouse_code || 'JDL';
      skuMap[item.sku].warehouses[key] = {
        sellable: item.sellable, reserved: item.reserved,
        onway: item.onway, unsellable: item.unsellable, hold: item.hold,
      };
    }
  }

  // ECCANG：单仓
  if (eccangResult?.data) {
    for (const item of eccangResult.data) {
      if (!item.sku) continue;
      if (!skuMap[item.sku]) skuMap[item.sku] = { sku: item.sku, warehouses: {} };
      skuMap[item.sku].warehouses['ECCANG'] = {
        sellable: item.sellable, reserved: item.reserved,
        onway: item.onway, unsellable: item.unsellable, hold: item.hold,
      };
    }
  }

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
