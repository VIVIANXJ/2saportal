/**
 * /api/orders/eccang
 * 直接从 ECCANG 拉取订单，支持分页循环拉全量
 *
 * GET ?q=ORDER123          按订单号/参考号搜索
 * GET ?page=1&pageSize=50  分页（默认只拉当页）
 * GET ?all=1               拉所有订单（循环分页，最多20页）
 */

import xml2js from 'xml2js';

const ECCANG_BASE_URL = process.env.ECCANG_BASE_URL;
const APP_TOKEN       = process.env.ECCANG_APP_TOKEN;
const APP_KEY         = process.env.ECCANG_APP_KEY;
const WAREHOUSE_CODE  = process.env.ECCANG_WAREHOUSE_CODE || 'AUSYD';
const PAGE_SIZE       = 50;

function buildSoap(service, paramsJson) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://www.example.org/Ec/">
  <SOAP-ENV:Body>
    <ns1:callService>
      <paramsJson>${JSON.stringify(paramsJson)}</paramsJson>
      <appToken>${APP_TOKEN}</appToken>
      <appKey>${APP_KEY}</appKey>
      <service>${service}</service>
    </ns1:callService>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
}

async function parseSoap(xmlText) {
  const parser   = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
  const result   = await parser.parseStringPromise(xmlText);
  const envelope = result['SOAP-ENV:Envelope'] || result['soapenv:Envelope'];
  const body     = envelope['SOAP-ENV:Body']   || envelope['soapenv:Body'];
  const response = body['ns1:callServiceResponse']?.response
                || body['callServiceResponse']?.response;
  if (!response) throw new Error('Unexpected SOAP structure');
  return JSON.parse(response);
}

async function callEccang(service, params) {
  const res = await fetch(ECCANG_BASE_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'text/xml; charset=UTF-8', 'SOAPAction': '' },
    body:    buildSoap(service, params),
  });
  if (!res.ok) throw new Error(`ECCANG HTTP ${res.status}`);
  return parseSoap(await res.text());
}

function normaliseOrder(order) {
  const items = order.details
    ? (Array.isArray(order.details) ? order.details : [order.details])
    : [];
  return {
    id:               order.order_code,
    order_number:     order.order_code,
    reference_no:     order.ref_code           || '',
    warehouse:        order.warehouse_code      || WAREHOUSE_CODE,
    status:           (order.order_status_name || order.order_status || '').toLowerCase(),
    carrier:          order.logistics_name      || '',
    tracking_number:  order.logistics_code      || '',
    created_at:       order.create_time         || '',
    shipped_at:       order.delivery_time       || '',
    ship_to_name:     order.consignee_name      || '',
    ship_to_address:  [order.country, order.province, order.city, order.address].filter(Boolean).join(', '),
    order_type:       'standard',
    client:           order.ref_code?.startsWith('ASL') ? 'ASL' : order.ref_code?.startsWith('CCEP') ? 'CCEP' : '2SA',
    order_items: items.map(i => ({
      sku:          i.product_sku,
      product_name: i.product_name || '',
      quantity:     parseInt(i.quantity) || 0,
    })),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!ECCANG_BASE_URL || !APP_TOKEN || !APP_KEY) {
    return res.status(500).json({ error: 'ECCANG credentials not configured' });
  }

  try {
    const { q, page = '1', pageSize = String(PAGE_SIZE), all } = req.query;

    // 精确搜索：按订单号或参考号
    if (q?.trim()) {
      // 先试订单号
      const d1 = await callEccang('getOrderByCode', { order_code: q.trim(), warehouse_code: WAREHOUSE_CODE });
      if (d1.ask === 'Success' && d1.data) {
        const orders = Array.isArray(d1.data) ? d1.data : [d1.data];
        return res.status(200).json({ success: true, count: orders.length, data: orders.map(normaliseOrder) });
      }
      // 再试参考号
      const d2 = await callEccang('getOrderByRefCode', { ref_code: q.trim(), warehouse_code: WAREHOUSE_CODE });
      if (d2.ask === 'Success' && d2.data) {
        const orders = Array.isArray(d2.data) ? d2.data : [d2.data];
        return res.status(200).json({ success: true, count: orders.length, data: orders.map(normaliseOrder) });
      }
      // 试列表搜索
      const d3 = await callEccang('getOrderList', { page: 1, pageSize: String(PAGE_SIZE), warehouse_code: WAREHOUSE_CODE, ref_code: q.trim() });
      if (d3.ask === 'Success') {
        const orders = Array.isArray(d3.data) ? d3.data : (d3.data ? [d3.data] : []);
        return res.status(200).json({ success: true, count: orders.length, data: orders.map(normaliseOrder) });
      }
      return res.status(200).json({ success: true, count: 0, data: [] });
    }

    // 拉全量（循环分页）
    if (all === '1') {
      const allOrders = [];
      let p = 1;
      let hasMore = true;
      while (hasMore && p <= 20) {
        const data = await callEccang('getOrderList', {
          page:           p,
          pageSize:       String(PAGE_SIZE),
          warehouse_code: WAREHOUSE_CODE,
        });
        if (data.ask !== 'Success') break;
        const orders = Array.isArray(data.data) ? data.data : (data.data ? [data.data] : []);
        allOrders.push(...orders.map(normaliseOrder));
        hasMore = data.nextPage === 'true' || data.nextPage === true;
        p++;
      }
      return res.status(200).json({ success: true, count: allOrders.length, pages_fetched: p - 1, data: allOrders });
    }

    // 单页查询（默认）
    const data = await callEccang('getOrderList', {
      page:           parseInt(page),
      pageSize:       pageSize,
      warehouse_code: WAREHOUSE_CODE,
    });
    if (data.ask !== 'Success') {
      return res.status(400).json({ error: data.message || 'ECCANG error' });
    }
    const orders = Array.isArray(data.data) ? data.data : (data.data ? [data.data] : []);
    return res.status(200).json({
      success:  true,
      count:    parseInt(data.count) || orders.length,
      page:     parseInt(page),
      nextPage: data.nextPage === 'true',
      data:     orders.map(normaliseOrder),
    });

  } catch (err) {
    console.error('[ECCANG orders]', err);
    return res.status(500).json({ error: err.message });
  }
}
