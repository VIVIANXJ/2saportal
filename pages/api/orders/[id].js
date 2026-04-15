/**
 * /api/orders/[id]
 *
 * GET  → fetch single order with full details
 * PATCH → update order (status, tracking, etc.)
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { id } = req.query;

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*),
        kitting_jobs (*, kitting_components (*)),
        order_tracking (*)
      `)
      .eq('id', id)
      .single();

    if (error) return res.status(404).json({ error: 'Order not found' });
    return res.status(200).json({ success: true, data });
  }

  if (req.method === 'PATCH') {
    const {
      status, tracking_number, carrier, notes,
      shipped_at, tracking_event,
    } = req.body;

    const updates = {};
    if (status)          updates.status = status;
    if (tracking_number) updates.tracking_number = tracking_number;
    if (carrier)         updates.carrier = carrier;
    if (notes)           updates.notes = notes;
    if (shipped_at)      updates.shipped_at = shipped_at;

    const { data, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Append tracking history event if provided
    if (tracking_event) {
      await supabase.from('order_tracking').insert({
        order_id:    id,
        status:      tracking_event.status || status,
        description: tracking_event.description,
        location:    tracking_event.location,
      });
    }

    return res.status(200).json({ success: true, data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
