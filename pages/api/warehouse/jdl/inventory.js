/**
 * /api/warehouse/jdl/inventory
 * JDL iFOP 海外仓配 — 仓库库存查询
 *
 * 接口: FopOpenStockProvider / queryStockWarehouseListByPage
 * 路径: /fop/open/stockprovider/querystockwarehouselistbypage
 *
 * 字段名来自官方 SDK: JD_FOP_FULFILLMENT_CENTE_8_3_20251212170410.jar
 *   Request:  customerGoodsIdList, warehouseCode, page, pageSize
 *   Response: customerGoodsId, stockQuantity, totalQuantity,
 *             operatorLockNum, inventoryLockNum,
 *             preoccupiedQuantity, purchaseWaitinStockQuantity
 *
 * GET /api/warehouse/jdl/inventory?sku=SKU001
 * GET /api/warehouse/jdl/inventory?sku=SKU001,SKU002
 * GET /api/warehouse/jdl/inventory         (all, paginated)
 */

import crypto from 'crypto';

const BASE_URL     = process.env.JDL_BASE_URL    || 'https://api.jdl.com';
const APP_KEY      = process.env.JDL_APP_KEY;
const APP_SECRET   = process.env.JDL_APP_SECRET;
const ACCESS_TOKEN = process.env.JDL_ACCESS_TOKEN;

const STOCK_PATH = '/fop/open/stockprovider/querystockwarehouselistbypage';

/** Timestamp in GMT+8 → "YYYY-MM-DD HH:mm:ss" */
function getTimestamp() {
  const t = new Date(Date.now() + 8 * 3600 * 1000);
  return t.toISOString().replace('T', ' ').slice(0, 19);
}

/** JDL MD5 sign: appSecret + sorted(k+v) + appSecret → MD5 → UPPERCASE */
function buildSign(appKey, accessToken, timestamp, secret, body) {
  // JDL 签名规则（来自 SDK OAuth2Template.sign 方法）：
  // TreeMap 字母排序，包含 access_token, app_key, method, param_json(body JSON), timestamp, v
  const METHOD = '/fop/open/stockprovider/querystockwarehouselistbypage';
  const signMap = {
    access_token: accessToken,
    app_key:      appKey,
    method:       METHOD,
    param_json:   JSON.stringify(body),
    timestamp,
    v:            '2.0',
  };
  const content = secret
    + Object.keys(signMap).sort().map(k => k + signMap[k]).join('')
    + secret;
  return crypto.createHash('md5').update(content, 'utf8').digest('hex').toUpperCase();
}

/** Signed POST to iFOP */
async function callIfop(path, body = {}) {
  const timestamp = getTimestamp();
  const urlParams = { app_key: APP_KEY, access_token: ACCESS_TOKEN, timestamp, v: '2.0' };
  const sign = buildSign(APP_KEY, ACCESS_TOKEN, timestamp, APP_SECRET, body);

  const url = new URL(path, BASE_URL);
  Object.entries({ ...urlParams, sign }).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set('LOP-DN', 'JD_FOP_FULFILLMENT_CENTE');  // iFOP 海外仓服务域

  const res = await fetch(url.toString(), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`JDL HTTP ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); }
  catch { throw new Error(`JDL non-JSON: ${text.slice(0, 300)}`); }
}

/**
 * Normalise SDK response fields → unified shape across both warehouses
 *
 * SDK OpenStockWarehouseRespDto fields:
 *   customerGoodsId        → SKU (商家商品ID)
 *   jdGoodsId              → JD internal goods ID
 *   goodsName              → product name
 *   warehouseCode/Name     → warehouse
 *   stockQuantity          → 可用库存 (available/sellable)
 *   totalQuantity          → 总库存
 *   preoccupiedQuantity    → 预占库存 (reserved/allocated)
 *   operatorLockNum        → 操作锁定
 *   inventoryLockNum       → 库存锁定
 *   purchaseWaitinStockQuantity → 待入库 (on-way inbound)
 */
function normalise(item) {
  return {
    sku:            item.customerGoodsId || item.jdGoodsId,
    jd_goods_id:    item.jdGoodsId,
    product_name:   item.goodsName,
    warehouse:      'JDL',
    warehouse_code: item.warehouseCode,
    warehouse_name: item.warehouseName,
    sellable:       item.stockQuantity             || 0,   // 可用库存
    total:          item.totalQuantity             || 0,   // 总库存
    reserved:       item.preoccupiedQuantity       || 0,   // 预占
    operator_lock:  item.operatorLockNum           || 0,   // 操作锁定
    inventory_lock: item.inventoryLockNum          || 0,   // 库存锁定
    onway:          item.purchaseWaitinStockQuantity || 0, // 待入库
    total_available: item.stockQuantity            || 0,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ACCESS_TOKEN) {
    return res.status(503).json({
      error: 'JDL access_token not configured.',
      hint:  'Set JDL_ACCESS_TOKEN in .env.local',
    });
  }
  if (!APP_KEY || !APP_SECRET) {
    return res.status(500).json({ error: 'JDL APP_KEY or APP_SECRET not configured.' });
  }

  try {
    const { sku, page = '1', pageSize = '50' } = req.query;

    // Build request body using correct SDK field names
    const bodyObj = {
      page:         parseInt(page),
      pageSize:     parseInt(pageSize),
      customerCode: process.env.JDL_CUSTOMER_CODE || 'KH20000015945',
    };

    if (sku) {
      const skuList = sku.split(',').map(s => s.trim()).filter(Boolean);
      bodyObj.customerGoodsIdList = skuList;
    }

    // SDK: getAppJsonParams/getBodyObject 는 ReqDto 를 List 에 넣어 직렬화
    // → body 와 param_json 모두 [{...}] 배열 형식이어야 함
    const body = [bodyObj];
    console.log('[JDL] body:', JSON.stringify(body));
    const raw = await callIfop(STOCK_PATH, body);
    console.log('[JDL] raw response:', JSON.stringify(raw).slice(0, 500));

    // iFOP response: { code: 200, message: 'success', data: { records: [...], total, current, size } }
    if (raw.code !== 200 && raw.code !== '200') {
      return res.status(400).json({
        error:   raw.message || 'iFOP API error',
        code:    raw.code,
        raw,
      });
    }

    const records    = raw.data?.records || raw.data?.data || [];
    const recArray   = Array.isArray(records) ? records : (records ? [records] : []);
    const normalised = recArray.map(normalise);

    return res.status(200).json({
      success:   true,
      warehouse: 'JDL',
      total:     raw.data?.total   || normalised.length,
      page:      raw.data?.current || parseInt(page),
      pageSize:  raw.data?.size    || parseInt(pageSize),
      data:      normalised,
    });

  } catch (err) {
    console.error('[JDL iFOP inventory]', err);
    return res.status(500).json({ error: err.message });
  }
}
