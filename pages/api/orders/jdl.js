/**
 * /api/orders/jdl
 * JDL iFOP 出库订单查询
 * GET ?q=ORDER123       按客户订单号/JD单号搜索
 * GET ?page=1           分页
 * GET ?all=1            拉全量（循环分页）
 */

import crypto from 'crypto';

const BASE_URL        = process.env.JDL_BASE_URL        || 'https://intl-api.jdl.com';
const APP_KEY         = process.env.JDL_APP_KEY;
const APP_SECRET      = process.env.JDL_APP_SECRET;
const ACCESS_TOKEN    = process.env.JDL_ACCESS_TOKEN;
const CUSTOMER_CODE   = process.env.JDL_CUSTOMER_CODE   || 'KH20000015945';
const OPERATOR_ACCT   = process.env.JDL_OPERATOR_ACCT   || 'g70capital';
const SYSTEM_CODE     = process.env.JDL_SYSTEM_CODE     || '2satest';
const OUTSTOCK_PATH   = '/fop/open/outstockprovider/queryoutstocklist';
const PAGE_SIZE       = 50;

function getTimestamp() {
  return new Date(Date.now() + 8 * 3600 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);
}

async function callJdl(bodyObj) {
  const timestamp = getTimestamp();
  const body = [bodyObj];

  const signMap = {
    access_token: ACCESS_TOKEN,
    app_key:      APP_KEY,
    method:       OUTSTOCK_PATH,
    param_json:   JSON.stringify(body),
    timestamp,
    v:            '2.0',
  };
  const signContent = APP_SECRET
    + Object.keys(signMap).sort().map(k => k + signMap[k]).join('')
    + APP_SECRET;
  const sign = crypto.createHash('md5').update(signContent, 'utf8').digest('hex').toUpperCase();

  const url = new URL(OUTSTOCK_PATH, BASE_URL);
  url.searchParams.set('app_key',      APP_KEY);
  url.searchParams.set('access_token', ACCESS_TOKEN);
  url.searchParams.set('timestamp',    timestamp);
  url.searchParams.set('v',            '2.0');
  url.searchParams.set('sign',         sign);
  url.searchParams.set('method',       OUTSTOCK_PATH);
  url.searchParams.set('LOP-DN',       'JD_FOP_FULFILLMENT_CENTE');

  const res  = await fetch(url.toString(), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`JDL HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

function normalise(order) {
  const goods = order.goodsDtoList || [];
  return {
    id:              order.serviceBillCode || order.customerOrderNo,
    order_number:    order.serviceBillCode,
    reference_no:    order.customerOrderNo,
    jd_order_no:     order.jdOrderNo,
    warehouse:       order.warehouseCode,
    status:          order.statusDesc  || String(order.status || ''),
    status_code:     order.status,
    carrier:         order.actualCarrierName || '',
    tracking_number: order.preShipWayBill   || '',
    created_at:      order.createTime       || '',
    outbound_at:     order.outboundTime     || '',
    signed_at:       order.signingTime      || '',
    ship_to_name:    order.consigneeInformation?.consigneeName || '',
    ship_to_country: order.consigneeInformation?.country       || '',
    order_items: goods.map(g => ({
      sku:          g.customerGoodsId || g.jdGoodsId,
      quantity:     g.quantity        || 0,
      qty_actual:   g.realOutstockQuantity || 0,
    })),
    source:          'JDL',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!ACCESS_TOKEN || !APP_KEY || !APP_SECRET) {
    return res.status(500).json({ error: 'JDL credentials not configured' });
  }

  try {
    const { q, page = '1', all } = req.query;

    const baseBody = {
      pageNo:          1,
      pageSize:        PAGE_SIZE,
      customerCode:    CUSTOMER_CODE,
      operatorAccount: OPERATOR_ACCT,
      systemCode:      SYSTEM_CODE,
    };

    // 按订单号搜索
    if (q?.trim()) {
      baseBody.customerOrderNo = q.trim(); // 客户订单号（参考号）
    }

    // 拉全量：循环分页
    if (all === '1' && !q?.trim()) {
      const allOrders = [];
      let p = 1;
      let hasMore = true;
      while (hasMore && p <= 20) {
        const data = await callJdl({ ...baseBody, pageNo: p });
        if (data.code !== 200 && data.code !== '200') {
          if (allOrders.length > 0) break;
          return res.status(400).json({ error: data.message || `JDL code ${data.code}`, raw: data });
        }
        const page_obj = data.data || {};
        const records  = page_obj.records || page_obj.list || [];
        allOrders.push(...records.map(normalise));
        const total     = page_obj.total    || 0;
        const totalPage = page_obj.totalPage || Math.ceil(total / PAGE_SIZE);
        hasMore = p < totalPage;
        p++;
      }
      return res.status(200).json({
        success: true, source: 'JDL',
        count: allOrders.length, pages_fetched: p - 1,
        data: allOrders,
      });
    }

    // 单页或搜索
    const data = await callJdl({ ...baseBody, pageNo: parseInt(page) });
    console.log('[JDL orders] response:', JSON.stringify(data).slice(0, 400));

    if (data.code !== 200 && data.code !== '200') {
      return res.status(400).json({ error: data.message || `JDL code ${data.code}`, raw: data });
    }

    const page_obj = data.data || {};
    const records  = page_obj.records || page_obj.list || [];
    return res.status(200).json({
      success:  true, source: 'JDL',
      count:    page_obj.total    || records.length,
      page:     parseInt(page),
      totalPage: page_obj.totalPage || 1,
      data:     records.map(normalise),
    });

  } catch (err) {
    console.error('[JDL orders]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
