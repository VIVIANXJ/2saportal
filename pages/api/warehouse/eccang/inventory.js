import xml2js from 'xml2js';

const ECCANG_BASE_URL = process.env.ECCANG_BASE_URL;
const APP_TOKEN       = process.env.ECCANG_APP_TOKEN;
const APP_KEY         = process.env.ECCANG_APP_KEY;
const WAREHOUSE_CODE  = process.env.ECCANG_WAREHOUSE_CODE || 'AUSYD';
const PAGE_SIZE       = 100; // 每页最多拉100条

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
  const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
  const result   = await parser.parseStringPromise(xmlText);
  const envelope = result['SOAP-ENV:Envelope'] || result['soapenv:Envelope'];
  const body     = envelope['SOAP-ENV:Body']   || envelope['soapenv:Body'];
  const response = body['ns1:callServiceResponse']?.response
                || body['callServiceResponse']?.response;
  if (!response) throw new Error('Unexpected SOAP structure');
  return JSON.parse(response);
}

async function fetchPage(skuList, page) {
  const params = { page, pageSize: String(PAGE_SIZE), warehouse_code: WAREHOUSE_CODE };
  if (skuList?.length === 1) params.product_sku = skuList[0];
  if (skuList?.length > 1)  params.product_sku_arr = skuList;

  const res = await fetch(ECCANG_BASE_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'text/xml; charset=UTF-8', 'SOAPAction': '' },
    body:    buildSoap('getProductInventory', params),
  });
  if (!res.ok) throw new Error(`ECCANG HTTP ${res.status}`);
  return parseSoap(await res.text());
}

function normalise(item) {
  return {
    sku:            item.product_sku,
    warehouse:      'ECCANG',
    warehouse_code: item.warehouse_code || WAREHOUSE_CODE,
    sellable:       parseInt(item.sellable)    || 0,
    reserved:       parseInt(item.reserved)    || 0,
    onway:          parseInt(item.onway)        || 0,
    pending:        parseInt(item.pending)      || 0,
    unsellable:     parseInt(item.unsellable)   || 0,
    hold:           parseInt(item.hold)         || 0,
    total_available: parseInt(item.sellable)   || 0,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!ECCANG_BASE_URL || !APP_TOKEN || !APP_KEY) {
    return res.status(500).json({ error: 'ECCANG credentials not configured' });
  }

  try {
    const { sku } = req.query;
    const skuList = sku ? sku.split(',').map(s => s.trim()).filter(Boolean) : null;

    // 如果是搜索特定 SKU，只拉一页
    if (skuList?.length) {
      const data = await fetchPage(skuList, 1);
      if (data.ask !== 'Success') {
        return res.status(400).json({ error: data.message || 'ECCANG error' });
      }
      const items = Array.isArray(data.data) ? data.data : (data.data ? [data.data] : []);
      return res.status(200).json({
        success: true, warehouse: 'ECCANG',
        count: items.length, data: items.map(normalise),
      });
    }

    // 没有 SKU 过滤 → 循环拉所有页，直到没有更多
    const allItems = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const data = await fetchPage(null, page);
      if (data.ask !== 'Success') {
        // 如果已经拉到了一些数据，返回已有的，不报错
        if (allItems.length > 0) break;
        return res.status(400).json({ error: data.message || 'ECCANG error' });
      }
      const items = Array.isArray(data.data) ? data.data : (data.data ? [data.data] : []);
      allItems.push(...items.map(normalise));

      // nextPage === 'true' 说明还有下一页
      hasMore = data.nextPage === 'true' || data.nextPage === true;
      page++;

      // 安全上限：最多拉 20 页（2000条）避免超时
      if (page > 20) break;
    }

    return res.status(200).json({
      success: true, warehouse: 'ECCANG',
      warehouse_code: WAREHOUSE_CODE,
      count: allItems.length,
      pages_fetched: page - 1,
      data: allItems,
    });

  } catch (err) {
    console.error('[ECCANG inventory]', err);
    return res.status(500).json({ error: err.message });
  }
}
