/**
 * /api/warehouse/jdl/inventory
 * JDL iFOP — 查询两个仓库库存并合并
 * 仓库：SYD-LG-2-AU 和 MEL-SM-1-AU
 */

import crypto from 'crypto';

const BASE_URL      = process.env.JDL_BASE_URL     || 'https://intl-api.jdl.com';
const APP_KEY       = process.env.JDL_APP_KEY;
const APP_SECRET    = process.env.JDL_APP_SECRET;
const ACCESS_TOKEN  = process.env.JDL_ACCESS_TOKEN;
const CUSTOMER_CODE = process.env.JDL_CUSTOMER_CODE || 'KH20000015945';
const WAREHOUSES    = ['SYD-LG-2-AU', 'MEL-SM-1-AU'];
const STOCK_PATH    = '/fop/open/stockprovider/querystockwarehouselistbypage';

function getTimestamp() {
  const t = new Date(Date.now() + 8 * 3600 * 1000);
  return t.toISOString().replace('T', ' ').slice(0, 19);
}

function buildSign(accessToken, appKey, timestamp, appSecret, body) {
  const signMap = {
    access_token: accessToken,
    app_key:      appKey,
    method:       STOCK_PATH,
    param_json:   JSON.stringify(body),
    timestamp,
    v:            '2.0',
  };
  const content = appSecret
    + Object.keys(signMap).sort().map(k => k + signMap[k]).join('')
    + appSecret;
  return crypto.createHash('md5').update(content, 'utf8').digest('hex').toUpperCase();
}

async function queryWarehouse(warehouseCode, skuList, page = 1, pageSize = 50) {
  const timestamp = getTimestamp();
  const bodyObj = {
    page,
    pageSize,
    customerCode:  CUSTOMER_CODE,
    warehouseCode,
  };
  if (skuList?.length) bodyObj.customerGoodsIdList = skuList;

  const body = [bodyObj];
  const sign = buildSign(ACCESS_TOKEN, APP_KEY, timestamp, APP_SECRET, body);

  const url = new URL(STOCK_PATH, BASE_URL);
  url.searchParams.set('app_key',      APP_KEY);
  url.searchParams.set('access_token', ACCESS_TOKEN);
  url.searchParams.set('timestamp',    timestamp);
  url.searchParams.set('v',            '2.0');
  url.searchParams.set('sign',         sign);
  url.searchParams.set('method',        METHOD);
  url.searchParams.set('LOP-DN',       'JD_FOP_FULFILLMENT_CENTE');

  const res  = await fetch(url.toString(), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`JDL HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!ACCESS_TOKEN || !APP_KEY || !APP_SECRET) {
    return res.status(500).json({ error: 'JDL credentials not configured' });
  }

  try {
    const { sku, page = '1', pageSize = '50' } = req.query;
    const skuList = sku ? sku.split(',').map(s => s.trim()).filter(Boolean) : null;

    // 同时查两个仓库
    const results = await Promise.allSettled(
      WAREHOUSES.map(wh => queryWarehouse(wh, skuList, parseInt(page), parseInt(pageSize)))
    );

    const allItems = [];
    const warehouseStatus = {};

    results.forEach((result, i) => {
      const wh = WAREHOUSES[i];
      if (result.status === 'fulfilled') {
        const raw = result.value;
        if (raw.code === 200 || raw.code === '200') {
          const records = raw.data?.records || [];
          records.forEach(item => {
            allItems.push({
              sku:            item.customerGoodsId || item.jdGoodsId,
              warehouse:      'JDL',
              warehouse_code: wh,
              sellable:       item.stockQuantity               || 0,
              total:          item.totalQuantity               || 0,
              reserved:       item.preoccupiedQuantity         || 0,
              onway:          item.purchaseWaitinStockQuantity || 0,
              operator_lock:  item.operatorLockNum             || 0,
              inventory_lock: item.inventoryLockNum            || 0,
            });
          });
          warehouseStatus[wh] = 'ok';
        } else {
          warehouseStatus[wh] = raw.message || `code ${raw.code}`;
        }
      } else {
        warehouseStatus[wh] = result.reason?.message || 'error';
      }
    });

    return res.status(200).json({
      success:          true,
      warehouse:        'JDL',
      warehouse_status: warehouseStatus,
      count:            allItems.length,
      data:             allItems,
    });

  } catch (err) {
    console.error('[JDL] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
