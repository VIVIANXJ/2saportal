/**
 * /api/orders
 *
 * GET  ?q=REF001&type=kitting&status=shipped&page=1
 *        → fuzzy search by order_number OR reference_no
 *        → filter by order_type (kitting | standard)
 *        → filter by status
 *
 * POST body: { ...orderFields }
 *        → create new order (2SA admin only)
 */

import { createClient } from '@supabase/supabase-js';

function getSupabase(req) {
  // Use service role for server-side operations
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export default async function handler(req, res) {
  const supabase = getSupabase(req);

  if (req.method === 'GET') {
    const {
      q,
      type,
      status,
      client,
      warehouse,
      page = '1',
      pageSize = '20',
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page));
    const limit    = Math.min(100, parseInt(pageSize));
    const offset   = (pageNum - 1) * limit;

    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items (sku, product_name, quantity, notes),
        kitting_jobs (id, kit_sku, kit_name, quantity, status,
          kitting_components (component_sku, component_name, qty_per_kit, total_qty)
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Fuzzy search on order_number OR reference_no
    if (q && q.trim()) {
      const term = q.trim();
      query = query.or(`order_number.ilike.%${term}%,reference_no.ilike.%${term}%`);
    }

    if (type)      query = query.eq('order_type', type);
    if (status)    query = query.eq('status', status);
    if (client)    query = query.eq('client', client);
    if (warehouse) query = query.eq('warehouse', warehouse);

    const { data, error, count } = await query;

    if (error) {
      console.error('[orders GET]', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        total: count,
        page: pageNum,
        pageSize: limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  }

  if (req.method === 'POST') {
    const {
      order_number, reference_no, order_type, client,
      warehouse, ship_to_name, ship_to_address, notes,
      items = [],       // [{ sku, product_name, quantity }]
      kitting_jobs = [] // [{ kit_sku, kit_name, quantity, components: [...] }]
    } = req.body;

    if (!order_number || !order_type || !client || !warehouse) {
      return res.status(400).json({ error: 'Missing required fields: order_number, order_type, client, warehouse' });
    }

    // Insert order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        order_number, reference_no, order_type, client,
        warehouse, ship_to_name, ship_to_address, notes,
        status: 'pending',
      })
      .select()
      .single();

    if (orderErr) {
      if (orderErr.code === '23505') {
        return res.status(409).json({ error: `Order number "${order_number}" already exists` });
      }
      return res.status(500).json({ error: orderErr.message });
    }

    // Insert line items
    if (items.length > 0) {
      const { error: itemErr } = await supabase
        .from('order_items')
        .insert(items.map(i => ({ ...i, order_id: order.id })));
      if (itemErr) console.error('[order items insert]', itemErr);
    }

    // Insert kitting jobs + components
    for (const job of kitting_jobs) {
      const { data: kj, error: kjErr } = await supabase
        .from('kitting_jobs')
        .insert({
          order_id:  order.id,
          kit_sku:   job.kit_sku,
          kit_name:  job.kit_name,
          quantity:  job.quantity,
        })
        .select()
        .single();

      if (kjErr) { console.error('[kitting job insert]', kjErr); continue; }

      if (job.components?.length > 0) {
        await supabase.from('kitting_components').insert(
          job.components.map(c => ({
            kitting_job_id: kj.id,
            component_sku:  c.component_sku,
            component_name: c.component_name,
            qty_per_kit:    c.qty_per_kit,
            total_qty:      c.qty_per_kit * job.quantity,
          }))
        );
      }
    }

    return res.status(201).json({ success: true, data: order });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
