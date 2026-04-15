/**
 * /api/warehouse/eccang/inventory
 * Proxies inventory queries to ECCANG WMS (SOAP/XML)
 * Warehouse: AUSYD (Sydney)
 *
 * GET ?sku=SKU001           → single SKU
 * GET ?sku=SKU001,SKU002    → multiple SKUs (comma-separated)
 * GET                       → all inventory (paginated)
 */

import xml2js from 'xml2js';

const ECCANG_BASE_URL = process.env.ECCANG_BASE_URL;
const APP_TOKEN       = process.env.ECCANG_APP_TOKEN;
const APP_KEY         = process.env.ECCANG_APP_KEY;
const WAREHOUSE_CODE  = process.env.ECCANG_WAREHOUSE_CODE || 'AUSYD';

/** Build SOAP envelope for ECCANG callService */
function buildSoapRequest(service, paramsJson) {
  const params = JSON.stringify(paramsJson);
  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope
  xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ns1="http://www.example.org/Ec/">
  <SOAP-ENV:Body>
    <ns1:callService>
      <paramsJson>${params}</paramsJson>
      <appToken>${APP_TOKEN}</appToken>
      <appKey>${APP_KEY}</appKey>
      <service>${service}</service>
    </ns1:callService>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
}

/** Parse ECCANG SOAP XML response → JS object */
async function parseSoapResponse(xmlText) {
  const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
  const result = await parser.parseStringPromise(xmlText);
  const envelope = result['SOAP-ENV:Envelope'] || result['soapenv:Envelope'];
  const body     = envelope['SOAP-ENV:Body'] || envelope['soapenv:Body'];
  const response = body['ns1:callServiceResponse']?.response
                || body['callServiceResponse']?.response;
  if (!response) throw new Error('Unexpected SOAP response structure');
  return JSON.parse(response);
}

/** Fetch one page of inventory for given SKU(s) */
async function fetchInventoryPage(skuList, page = 1, pageSize = 50) {
  const paramsJson = {
    page,
    pageSize: String(pageSize),
    warehouse_code: WAREHOUSE_CODE,
  };
  if (skuList && skuList.length === 1) {
    paramsJson.product_sku = skuList[0];
  } else if (skuList && skuList.length > 1) {
    paramsJson.product_sku_arr = skuList;
  }

  const soap = buildSoapRequest('getProductInventory', paramsJson);

  const res = await fetch(ECCANG_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=UTF-8',
      'SOAPAction': '',
    },
    body: soap,
  });

  if (!res.ok) throw new Error(`ECCANG HTTP ${res.status}`);
  const xml = await res.text();
  return parseSoapResponse(xml);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check env vars are configured
  if (!ECCANG_BASE_URL || !APP_TOKEN || !APP_KEY) {
    return res.status(500).json({ error: 'ECCANG credentials not configured' });
  }

  try {
    const { sku, page = '1', pageSize = '50' } = req.query;
    const skuList = sku ? sku.split(',').map(s => s.trim()).filter(Boolean) : null;

    const data = await fetchInventoryPage(skuList, parseInt(page), parseInt(pageSize));

    if (data.ask !== 'Success') {
      return res.status(400).json({
        error: data.message || 'ECCANG API error',
        eccangError: data.Error,
      });
    }

    // Normalise into consistent shape across warehouses
    const items = Array.isArray(data.data) ? data.data : (data.data ? [data.data] : []);
    const normalised = items.map(item => ({
      sku:            item.product_sku,
      warehouse:      'ECCANG',
      warehouse_code: item.warehouse_code || WAREHOUSE_CODE,
      sellable:       parseInt(item.sellable)   || 0,
      reserved:       parseInt(item.reserved)   || 0,
      onway:          parseInt(item.onway)       || 0,
      pending:        parseInt(item.pending)     || 0,
      unsellable:     parseInt(item.unsellable)  || 0,
      hold:           parseInt(item.hold)        || 0,
      total_available: parseInt(item.sellable)   || 0,
    }));

    return res.status(200).json({
      success: true,
      warehouse: 'ECCANG',
      warehouse_code: WAREHOUSE_CODE,
      count: parseInt(data.count) || normalised.length,
      page: parseInt(page),
      nextPage: data.nextPage === 'true',
      data: normalised,
    });
  } catch (err) {
    console.error('[ECCANG inventory]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
