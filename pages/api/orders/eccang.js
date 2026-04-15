/**
 * /api/orders/eccang
 * 直接从 ECCANG 拉取订单数据
 *
 * GET ?q=ORDER123          按订单号搜索
 * GET ?ref=REF456          按参考号搜索
 * GET ?status=shipped      按状态过滤
 * GET ?page=1&pageSize=50  分页
 */

import xml2js from 'xml2js';

const ECCANG_BASE_URL = process.env.ECCANG_BASE_URL;
const APP_TOKEN       = process.env.ECCANG_APP_TOKEN;
const APP_KEY         = process.env.ECCANG_APP_KEY;
const WAREHOUSE_CODE  = process.env.ECCANG_WAREHOUSE_CODE || 'AUSYD';

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
  // 统一订单格式
  const items = order.details
    ? (Array.isArray(order.details) ? order.details : [order.details])
    : [];

  return {
    order_number:     order.order_code         || order.ref_code,
    reference_no:     order.ref_code           || order.order_code,
    warehouse:        order.warehouse_code      || WAREHOUSE_CODE,
    status:           order.order_status_name  || order.order_status || '',
    status_code:      order.order_status,
    carrier:          order.logistics_name      || '',
    tracking_number:  order.logistics_code      || '',
    created_at:       order.create_time         || '',
    shipped_at:       order.delivery_time       || '',
    ship_to_name:     order.consignee_name      || '',
    ship_to_address:  [order.country, order.province, order.city, order.address]
                        .filter(Boolean).join(', '),
    items: items.map(i => ({
      sku:          i.product_sku,
      product_name: i.product_name || '',
      quantity:     parseInt(i.quantity) || 0,
    })),
    raw: order,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!ECCANG_BASE_URL || !APP_TOKEN || !APP_KEY) {
    return res.status(500).json({ error: 'ECCANG credentials not configured' });
  }

  try {
    const { q, ref, status, page = '1', pageSize = '50' } = req.query;

    // 按订单号精确查询
    if (q && !q.includes(' ')) {
      const data = await callEccang('getOrderByCode', {
        order_code:     q,
        warehouse_code: WAREHOUSE_CODE,
      });
      if (data.ask !== 'Success') {
        // 尝试按参考号查
        const data2 = await callEccang('getOrderByRefCode', {
          ref_code:       q,
          warehouse_code: WAREHOUSE_CODE,
        });
        if (data2.ask !== 'Success') {
          return res.status(200).json({ success: true, count: 0, data: [] });
        }
        const orders = Array.isArray(data2.data) ? data2.data : (data2.data ? [data2.data] : []);
        return res.status(200).json({
          success: true, count: orders.length,
          data: orders.map(normaliseOrder),
        });
      }
      const orders = Array.isArray(data.data) ? data.data : (data.data ? [data.data] : []);
      return res.status(200).json({
        success: true, count: orders.length,
        data: orders.map(normaliseOrder),
      });
    }

    // 列表查询
    const params = {
      page:           parseInt(page),
      pageSize:       String(parseInt(pageSize)),
      warehouse_code: WAREHOUSE_CODE,
    };
    if (ref)    params.ref_code     = ref;
    if (status) params.order_status = status;

    const data = await callEccang('getOrderList', params);
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
