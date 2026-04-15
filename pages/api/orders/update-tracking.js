/**
 * /api/orders/update-tracking
 * 批量更新 ECCANG 订单 tracking
 * POST body: { items: [{ order_code, tracking_number, carrier }] }
 */
import { verifyToken } from '../auth/login';
import xml2js from 'xml2js';

const ECCANG_BASE_URL = process.env.ECCANG_BASE_URL;
const APP_TOKEN       = process.env.ECCANG_APP_TOKEN;
const APP_KEY         = process.env.ECCANG_APP_KEY;

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
  return JSON.parse(response);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 验证 admin token
  const auth  = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });

  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array required' });
  }

  const results = [];
  for (const item of items) {
    const { order_code, tracking_number, carrier } = item;
    if (!order_code || !tracking_number) {
      results.push({ order_code, success: false, error: 'Missing order_code or tracking_number' });
      continue;
    }
    try {
      const res2 = await fetch(ECCANG_BASE_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'text/xml; charset=UTF-8', 'SOAPAction': '' },
        body:    buildSoap('updateOrderTracking', {
          order_code, tracking_number,
          logistics_name: carrier || '',
        }),
      });
      const data = await parseSoap(await res2.text());
      results.push({ order_code, success: data.ask === 'Success', message: data.message });
    } catch (e) {
      results.push({ order_code, success: false, error: e.message });
    }
  }

  const ok    = results.filter(r => r.success).length;
  const fail  = results.filter(r => !r.success).length;
  return res.status(200).json({ success: true, updated: ok, failed: fail, results });
}
