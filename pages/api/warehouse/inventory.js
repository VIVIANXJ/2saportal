/**
 * /api/warehouse/inventory
 * Aggregates inventory from BOTH warehouses (JDL + ECCANG)
 * Returns combined view per SKU
 *
 * GET ?sku=SKU001
 * GET ?sku=SKU001,SKU002
 * GET ?warehouse=ECCANG    (filter to one warehouse)
 * GET ?warehouse=JDL
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sku, warehouse } = req.query;
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const skuParam = sku ? `?sku=${sku}` : '';

  const results = { JDL: null, ECCANG: null };
  const errors  = {};

  // Decide which warehouses to query
  const queryJdl    = !warehouse || warehouse.toUpperCase() === 'JDL';
  const queryEccang = !warehouse || warehouse.toUpperCase() === 'ECCANG';

  await Promise.allSettled([
    queryJdl ? fetch(`${baseUrl}/api/warehouse/jdl/inventory${skuParam}`)
      .then(r => r.json())
      .then(d => { results.JDL = d; })
      .catch(e => { errors.JDL = e.message; }) : Promise.resolve(),

    queryEccang ? fetch(`${baseUrl}/api/warehouse/eccang/inventory${skuParam}`)
      .then(r => r.json())
      .then(d => { results.ECCANG = d; })
      .catch(e => { errors.ECCANG = e.message; }) : Promise.resolve(),
  ]);

  // Merge results: group by SKU, show stock in each warehouse
  const skuMap = {};

  const processWarehouse = (warehouseData, warehouseName) => {
    if (!warehouseData?.data) return;
    for (const item of warehouseData.data) {
      if (!item.sku) continue;
      if (!skuMap[item.sku]) {
        skuMap[item.sku] = { sku: item.sku, warehouses: {} };
      }
      skuMap[item.sku].warehouses[warehouseName] = {
        sellable:   item.sellable,
        reserved:   item.reserved,
        onway:      item.onway,
        unsellable: item.unsellable,
        hold:       item.hold,
      };
    }
  };

  processWarehouse(results.JDL,    'JDL');
  processWarehouse(results.ECCANG, 'ECCANG');

  // Add total_sellable across all warehouses
  const combined = Object.values(skuMap).map(entry => ({
    ...entry,
    total_sellable: Object.values(entry.warehouses)
      .reduce((sum, w) => sum + (w.sellable || 0), 0),
  }));

  return res.status(200).json({
    success: true,
    data: combined,
    warehouses: {
      JDL:    results.JDL?.success ? 'ok' : (results.JDL?.error || errors.JDL || 'not configured'),
      ECCANG: results.ECCANG?.success ? 'ok' : (results.ECCANG?.error || errors.ECCANG || 'error'),
    },
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  });
}
