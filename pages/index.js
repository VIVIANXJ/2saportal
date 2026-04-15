import { useState, useCallback, useRef } from 'react';
import Head from 'next/head';

// ── Colour tokens ──────────────────────────────────────────────
const C = {
  bg:       '#0E1117',
  surface:  '#161B24',
  border:   '#1F2937',
  borderHi: '#2D3748',
  accent:   '#3B82F6',
  accentDim:'#1E3A5F',
  text:     '#E2E8F0',
  muted:    '#64748B',
  dimmed:   '#94A3B8',
  success:  '#10B981',
  warning:  '#F59E0B',
  danger:   '#EF4444',
};

const STATUS_COLORS = {
  pending:    { bg: '#1C2333', text: '#94A3B8', dot: '#64748B' },
  processing: { bg: '#1A2B4A', text: '#60A5FA', dot: '#3B82F6' },
  packed:     { bg: '#1A2B4A', text: '#818CF8', dot: '#6366F1' },
  shipped:    { bg: '#1A3340', text: '#34D399', dot: '#10B981' },
  delivered:  { bg: '#162B23', text: '#6EE7B7', dot: '#059669' },
  cancelled:  { bg: '#2D1A1A', text: '#FCA5A5', dot: '#EF4444' },
};

// ── Components ─────────────────────────────────────────────────
function Badge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 4,
      background: c.bg, color: c.text,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
      textTransform: 'uppercase',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.dot }} />
      {status}
    </span>
  );
}

function TypeTag({ type }) {
  const isKitting = type === 'kitting';
  return (
    <span style={{
      padding: '2px 7px', borderRadius: 3,
      background: isKitting ? '#2D2010' : '#101C2D',
      color: isKitting ? '#FBB86C' : '#7CB9F4',
      fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
      textTransform: 'uppercase', border: `1px solid ${isKitting ? '#4A3010' : '#1A3050'}`,
    }}>
      {isKitting ? '◈ KITTING' : '▦ STANDARD'}
    </span>
  );
}

function StockBar({ sellable, reserved, onway }) {
  const total = Math.max(sellable + reserved + onway, 1);
  return (
    <div style={{ display: 'flex', gap: 2, height: 4, borderRadius: 2, overflow: 'hidden', width: 80 }}>
      <div style={{ width: `${(sellable/total)*100}%`, background: C.success, minWidth: sellable > 0 ? 2 : 0 }} />
      <div style={{ width: `${(reserved/total)*100}%`, background: C.warning, minWidth: reserved > 0 ? 2 : 0 }} />
      <div style={{ width: `${(onway/total)*100}%`, background: C.accent, minWidth: onway > 0 ? 2 : 0 }} />
    </div>
  );
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: 14, height: 14,
      border: `2px solid ${C.border}`, borderTopColor: C.accent,
      borderRadius: '50%', animation: 'spin 0.6s linear infinite',
    }} />
  );
}

// ── Main page ──────────────────────────────────────────────────
export default function Portal() {
  const [tab, setTab]           = useState('orders');      // 'orders' | 'inventory'
  const [orderType, setOrderType] = useState('all');       // 'all' | 'kitting' | 'standard'
  const [searchQ, setSearchQ]   = useState('');
  const [orders, setOrders]     = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError]       = useState(null);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [warehouseStatus, setWarehouseStatus] = useState({});
  const inputRef = useRef(null);

  const search = useCallback(async (q, type) => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'orders') {
        const params = new URLSearchParams({ pageSize: '50' });
        if (q) params.set('q', q);
        if (type !== 'all') params.set('type', type);
        const res = await fetch(`/api/orders?${params}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setOrders(json.data || []);
      } else {
        const params = new URLSearchParams();
        if (q) params.set('sku', q);
        const res = await fetch(`/api/warehouse/inventory?${params}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setInventory(json.data || []);
        setWarehouseStatus(json.warehouses || {});
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, [tab]);

  const handleSearch = (e) => {
    e.preventDefault();
    search(searchQ, orderType);
  };

  const handleTabSwitch = (t) => {
    setTab(t);
    setOrders([]);
    setInventory([]);
    setSearched(false);
    setError(null);
    setSearchQ('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <>
      <Head>
        <title>2SA Fulfillment Portal</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: ${C.bg}; color: ${C.text}; font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; }
          ::selection { background: ${C.accentDim}; }
          ::-webkit-scrollbar { width: 4px; height: 4px; }
          ::-webkit-scrollbar-track { background: ${C.bg}; }
          ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
          .row-hover:hover { background: #1A2133 !important; cursor: pointer; }
          .tab-btn { transition: all 0.15s; }
          .tab-btn:hover { color: ${C.text} !important; }
          input:focus { outline: none; box-shadow: 0 0 0 1px ${C.accent}; }
          button:hover { opacity: 0.85; }
          button:active { transform: scale(0.98); }
        `}</style>
      </Head>

      {/* ── Header ── */}
      <header style={{
        borderBottom: `1px solid ${C.border}`,
        padding: '0 24px',
        height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
        background: C.surface,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 4,
            background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px',
          }}>2S</div>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.05em', color: C.text }}>
            2SA FULFILLMENT
          </span>
          <span style={{ color: C.border, fontSize: 16 }}>|</span>
          <span style={{ fontSize: 12, color: C.muted, letterSpacing: '0.08em' }}>
            ASL / CCEP PORTAL
          </span>
        </div>
        <div style={{
          fontSize: 11, color: C.muted,
          padding: '3px 8px', border: `1px solid ${C.border}`,
          borderRadius: 3, letterSpacing: '0.04em',
        }}>
          READ-ONLY
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
          {[['orders', '▦ ORDERS'], ['inventory', '◉ INVENTORY']].map(([key, label]) => (
            <button key={key} className="tab-btn" onClick={() => handleTabSwitch(key)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '8px 16px',
              fontSize: 12, fontWeight: 600, letterSpacing: '0.06em',
              color: tab === key ? C.accent : C.muted,
              borderBottom: tab === key ? `2px solid ${C.accent}` : '2px solid transparent',
              marginBottom: -1,
              transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>

        {/* ── Search bar ── */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: C.muted, fontSize: 13,
            }}>⌕</span>
            <input
              ref={inputRef}
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder={tab === 'orders'
                ? 'Search by order number or reference no...'
                : 'Search by SKU...'}
              style={{
                width: '100%', padding: '9px 12px 9px 32px',
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 5, color: C.text, fontSize: 13,
                fontFamily: 'inherit',
                transition: 'border-color 0.15s',
              }}
            />
          </div>

          {tab === 'orders' && (
            <div style={{ display: 'flex', gap: 0, border: `1px solid ${C.border}`, borderRadius: 5, overflow: 'hidden' }}>
              {[['all','ALL'], ['standard','STANDARD'], ['kitting','KITTING']].map(([val, label]) => (
                <button key={val} type="button" onClick={() => { setOrderType(val); search(searchQ, val); }} style={{
                  background: orderType === val ? C.accentDim : C.surface,
                  border: 'none', cursor: 'pointer',
                  padding: '8px 12px',
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
                  color: orderType === val ? C.accent : C.muted,
                  borderRight: `1px solid ${C.border}`,
                  fontFamily: 'inherit',
                }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          <button type="submit" style={{
            background: C.accent, border: 'none', borderRadius: 5,
            padding: '9px 18px', cursor: 'pointer',
            color: '#fff', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {loading ? <Spinner /> : null}
            SEARCH
          </button>
        </form>

        {/* ── Warehouse status pills ── */}
        {tab === 'inventory' && searched && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {Object.entries(warehouseStatus).map(([wh, status]) => (
              <span key={wh} style={{
                fontSize: 11, padding: '3px 8px',
                borderRadius: 3,
                background: status === 'ok' ? '#162B23' : '#2D1A1A',
                color: status === 'ok' ? C.success : C.danger,
                border: `1px solid ${status === 'ok' ? '#1A4030' : '#4A1A1A'}`,
                letterSpacing: '0.04em',
              }}>
                {wh}: {status}
              </span>
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div style={{
            background: '#2D1A1A', border: `1px solid #4A1A1A`,
            borderRadius: 5, padding: '10px 14px',
            color: C.danger, fontSize: 13, marginBottom: 16,
          }}>
            ⚠ {error}
          </div>
        )}

        {/* ── Orders table ── */}
        {tab === 'orders' && searched && !loading && (
          <div style={{ animation: 'fadeIn 0.2s ease' }}>
            {orders.length === 0 ? (
              <div style={{ textAlign: 'center', color: C.muted, padding: '48px 0', fontSize: 13 }}>
                No orders found
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, letterSpacing: '0.04em' }}>
                  {orders.length} RESULT{orders.length !== 1 ? 'S' : ''}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {['ORDER NO.', 'REFERENCE', 'TYPE', 'CLIENT', 'WAREHOUSE', 'STATUS', 'TRACKING', 'CREATED'].map(h => (
                        <th key={h} style={{
                          padding: '7px 12px', textAlign: 'left',
                          color: C.muted, fontWeight: 600, fontSize: 10,
                          letterSpacing: '0.08em',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(order => (
                      <>
                        <tr
                          key={order.id}
                          className="row-hover"
                          onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                          style={{
                            borderBottom: `1px solid ${C.border}`,
                            background: expandedOrder === order.id ? '#1A2133' : 'transparent',
                          }}
                        >
                          <td style={{ padding: '10px 12px', color: C.accent, fontWeight: 600 }}>
                            {order.order_number}
                          </td>
                          <td style={{ padding: '10px 12px', color: C.dimmed }}>
                            {order.reference_no || <span style={{ color: C.border }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <TypeTag type={order.order_type} />
                          </td>
                          <td style={{ padding: '10px 12px', color: C.dimmed }}>{order.client}</td>
                          <td style={{ padding: '10px 12px', color: C.dimmed }}>{order.warehouse}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <Badge status={order.status} />
                          </td>
                          <td style={{ padding: '10px 12px', color: C.dimmed, fontSize: 11 }}>
                            {order.tracking_number || <span style={{ color: C.border }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 12px', color: C.muted, fontSize: 11 }}>
                            {new Date(order.created_at).toLocaleDateString('en-AU', {
                              day: '2-digit', month: 'short', year: 'numeric'
                            })}
                          </td>
                        </tr>

                        {/* ── Expanded detail row ── */}
                        {expandedOrder === order.id && (
                          <tr key={`${order.id}-detail`} style={{ background: '#111827' }}>
                            <td colSpan={8} style={{ padding: '16px 24px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

                                {/* Line items */}
                                {order.order_items?.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.08em', marginBottom: 8 }}>
                                      LINE ITEMS
                                    </div>
                                    {order.order_items.map((item, i) => (
                                      <div key={i} style={{
                                        display: 'flex', justifyContent: 'space-between',
                                        padding: '5px 0', borderBottom: `1px solid ${C.border}`,
                                        fontSize: 12,
                                      }}>
                                        <span style={{ color: C.accent }}>{item.sku}</span>
                                        <span style={{ color: C.dimmed }}>{item.product_name}</span>
                                        <span style={{ color: C.text }}>×{item.quantity}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Kitting jobs */}
                                {order.kitting_jobs?.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.08em', marginBottom: 8 }}>
                                      KITTING JOBS
                                    </div>
                                    {order.kitting_jobs.map((job, i) => (
                                      <div key={i} style={{ marginBottom: 10 }}>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                          <span style={{ color: C.warning, fontWeight: 600 }}>{job.kit_sku}</span>
                                          <span style={{ color: C.dimmed }}>{job.kit_name}</span>
                                          <span style={{ color: C.text }}>×{job.quantity}</span>
                                          <Badge status={job.status} />
                                        </div>
                                        {job.kitting_components?.map((c, j) => (
                                          <div key={j} style={{
                                            fontSize: 11, color: C.muted, paddingLeft: 12,
                                            display: 'flex', gap: 8,
                                          }}>
                                            <span>↳</span>
                                            <span style={{ color: C.dimmed }}>{c.component_sku}</span>
                                            <span>{c.component_name}</span>
                                            <span>×{c.qty_per_kit} per kit</span>
                                          </div>
                                        ))}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Ship-to */}
                                {order.ship_to_name && (
                                  <div>
                                    <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.08em', marginBottom: 8 }}>
                                      SHIP TO
                                    </div>
                                    <div style={{ fontSize: 12, color: C.dimmed, lineHeight: 1.6 }}>
                                      {order.ship_to_name}<br/>
                                      {order.ship_to_address && JSON.stringify(order.ship_to_address)}
                                    </div>
                                  </div>
                                )}

                                {/* Notes */}
                                {order.notes && (
                                  <div>
                                    <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.08em', marginBottom: 8 }}>
                                      NOTES
                                    </div>
                                    <div style={{ fontSize: 12, color: C.dimmed }}>{order.notes}</div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {/* ── Inventory table ── */}
        {tab === 'inventory' && searched && !loading && (
          <div style={{ animation: 'fadeIn 0.2s ease' }}>
            {inventory.length === 0 ? (
              <div style={{ textAlign: 'center', color: C.muted, padding: '48px 0', fontSize: 13 }}>
                No inventory found
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, letterSpacing: '0.04em' }}>
                  {inventory.length} SKU{inventory.length !== 1 ? 'S' : ''}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {['SKU', 'TOTAL SELLABLE', 'JDL — SELLABLE', 'JDL — RESERVED', 'ECCANG — SELLABLE', 'ECCANG — RESERVED', 'ECCANG — ON-WAY'].map(h => (
                        <th key={h} style={{
                          padding: '7px 12px', textAlign: 'left',
                          color: C.muted, fontWeight: 600, fontSize: 10,
                          letterSpacing: '0.07em',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map((item, i) => {
                      const jdl = item.warehouses?.JDL;
                      const ec  = item.warehouses?.ECCANG;
                      return (
                        <tr key={i} className="row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: '10px 12px', color: C.accent, fontWeight: 600 }}>
                            {item.sku}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ color: C.text, fontWeight: 600 }}>{item.total_sellable}</span>
                              {item.total_sellable > 0 && (
                                <StockBar
                                  sellable={item.total_sellable}
                                  reserved={(jdl?.reserved || 0) + (ec?.reserved || 0)}
                                  onway={(ec?.onway || 0)}
                                />
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', color: jdl ? C.success : C.border }}>
                            {jdl ? jdl.sellable : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', color: jdl ? C.warning : C.border }}>
                            {jdl ? jdl.reserved : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', color: ec ? C.success : C.border }}>
                            {ec ? ec.sellable : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', color: ec ? C.warning : C.border }}>
                            {ec ? ec.reserved : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', color: ec ? C.accent : C.border }}>
                            {ec ? ec.onway : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Legend */}
                <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 10, color: C.muted }}>
                  <span><span style={{ color: C.success }}>■</span> Sellable</span>
                  <span><span style={{ color: C.warning }}>■</span> Reserved</span>
                  <span><span style={{ color: C.accent }}>■</span> On-way</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Empty state / prompt ── */}
        {!searched && !loading && (
          <div style={{
            textAlign: 'center', padding: '60px 0',
            color: C.muted,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>
              {tab === 'orders' ? '▦' : '◉'}
            </div>
            <div style={{ fontSize: 13, letterSpacing: '0.04em' }}>
              {tab === 'orders'
                ? 'Search by order number or reference to view orders'
                : 'Search by SKU to view live inventory across both warehouses'}
            </div>
          </div>
        )}

      </main>
    </>
  );
}
