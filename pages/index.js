import { useState, useCallback, useRef } from 'react';
import Head from 'next/head';

const C = {
  bg:       '#F8F9FA',
  surface:  '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  border:   '#E2E8F0',
  borderHi: '#CBD5E1',
  accent:   '#2563EB',
  accentDim:'#DBEAFE',
  accentText:'#1D4ED8',
  text:     '#0F172A',
  muted:    '#64748B',
  dimmed:   '#475569',
  success:  '#059669',
  successBg:'#ECFDF5',
  warning:  '#D97706',
  warningBg:'#FFFBEB',
  danger:   '#DC2626',
  dangerBg: '#FEF2F2',
};

const STATUS_COLORS = {
  pending:    { bg: '#F8FAFC', text: '#64748B', dot: '#94A3B8', border: '#E2E8F0' },
  processing: { bg: '#EFF6FF', text: '#2563EB', dot: '#3B82F6', border: '#BFDBFE' },
  packed:     { bg: '#F5F3FF', text: '#7C3AED', dot: '#8B5CF6', border: '#DDD6FE' },
  shipped:    { bg: '#ECFDF5', text: '#059669', dot: '#10B981', border: '#A7F3D0' },
  delivered:  { bg: '#F0FDF4', text: '#16A34A', dot: '#22C55E', border: '#BBF7D0' },
  cancelled:  { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444', border: '#FECACA' },
};

function Badge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', borderRadius: 20,
      background: c.bg, color: c.text,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.03em',
      textTransform: 'uppercase',
      border: `1px solid ${c.border}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

function TypeTag({ type }) {
  const isKitting = type === 'kitting';
  return (
    <span style={{
      padding: '3px 8px', borderRadius: 4,
      background: isKitting ? '#FFFBEB' : '#EFF6FF',
      color: isKitting ? '#92400E' : '#1E40AF',
      fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
      textTransform: 'uppercase',
      border: `1px solid ${isKitting ? '#FDE68A' : '#BFDBFE'}`,
    }}>
      {isKitting ? '◈ KITTING' : '▦ STANDARD'}
    </span>
  );
}


function Pagination({ page: currentPage, total, pageSize, onChange }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const pages = [];
  let start = Math.max(1, currentPage - 3);
  let end   = Math.min(totalPages, start + 6);
  if (end - start < 6) start = Math.max(1, end - 6);
  for (let i = start; i <= end; i++) pages.push(i);

  const btnStyle = (active) => ({
    padding: '6px 11px', borderRadius: 6, border: `1px solid ${active ? '#2563EB' : '#E2E8F0'}`,
    background: active ? '#2563EB' : '#fff', color: active ? '#fff' : '#475569',
    fontWeight: active ? 700 : 400, fontSize: 13, cursor: 'pointer', transition: 'all 0.1s',
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 20px', borderTop: '1px solid #E2E8F0', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 12, color: '#64748B' }}>
        {((currentPage-1)*pageSize)+1}–{Math.min(currentPage*pageSize, total)} of {total}
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={() => onChange(1)}              disabled={currentPage===1}           style={btnStyle(false)}>«</button>
        <button onClick={() => onChange(currentPage-1)}  disabled={currentPage===1}           style={btnStyle(false)}>‹</button>
        {pages.map(p => <button key={p} onClick={() => onChange(p)} style={btnStyle(p===currentPage)}>{p}</button>)}
        <button onClick={() => onChange(currentPage+1)}  disabled={currentPage===totalPages}  style={btnStyle(false)}>›</button>
        <button onClick={() => onChange(totalPages)}     disabled={currentPage===totalPages}  style={btnStyle(false)}>»</button>
      </div>
    </div>
  );
}

function StockBar({ sellable, reserved, onway }) {
  const total = Math.max(sellable + reserved + onway, 1);
  return (
    <div style={{ display: 'flex', gap: 2, height: 6, borderRadius: 3, overflow: 'hidden', width: 80, background: C.border }}>
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

export default function Portal() {
  const [tab, setTab]             = useState('orders');
  const [orderType, setOrderType] = useState('all');
  const [searchQ, setSearchQ]     = useState('');
  const [orders, setOrders]       = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [searched, setSearched]   = useState(false);
  const [error, setError]         = useState(null);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [warehouseStatus, setWarehouseStatus] = useState({});
  const [orderPage,   setOrderPage]   = useState(1);
  const [invPage,     setInvPage]     = useState(1);
  const PAGE_SIZE = 100;

  // 筛选状态
  const [invFilter,    setInvFilter]    = useState('all');   // 'all' | 'JDL' | 'ECCANG'
  const [hideZero,     setHideZero]     = useState(false);
  const [invSearch,    setInvSearch]    = useState('');
  const [orderSearch,  setOrderSearch]  = useState('');
  const inputRef = useRef(null);

  const search = useCallback(async (q, type) => {
    setLoading(true);
    setError(null);
    setOrderPage(1);
    setInvPage(1);
    try {
      if (tab === 'orders') {
        const params = new URLSearchParams(searchQ ? { pageSize: '50' } : { all: '1', pageSize: '50' });
        if (q) params.set('q', q);
        if (type !== 'all') params.set('type', type);
        const res  = await fetch(`/api/orders/eccang?${params}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setOrders(json.data || []);
      } else {
        const params = new URLSearchParams();
        if (q) params.set('sku', q);
        const res  = await fetch(`/api/warehouse/inventory?${params}`);
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

  const handleSearch = (e) => { e.preventDefault(); search(searchQ, orderType); };

  const handleTabSwitch = (t) => {
    setTab(t); setOrders([]); setInventory([]);
    setSearched(false); setError(null); setSearchQ('');
    setOrderPage(1); setInvPage(1);
    setInvFilter('all'); setHideZero(false); setInvSearch(''); setOrderSearch('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <>
      <Head>
        <title>2SA Fulfillment Portal</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: ${C.bg}; color: ${C.text}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
          ::selection { background: ${C.accentDim}; }
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: ${C.bg}; }
          ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
          ::-webkit-scrollbar-thumb:hover { background: ${C.borderHi}; }
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
          .row-hover:hover { background: ${C.surfaceAlt} !important; cursor: pointer; }
          input:focus { outline: none; border-color: ${C.accent} !important; box-shadow: 0 0 0 3px ${C.accentDim}; }
          button { transition: all 0.15s; }
          button:active { transform: scale(0.98); }
          .tab-btn:hover { color: ${C.text} !important; }
        `}</style>
      </Head>

      {/* Header */}
      <header style={{
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        padding: '0 24px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px',
          }}>2S</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, letterSpacing: '-0.01em' }}>
              2SA Fulfillment
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>Client Portal</div>
          </div>
        </div>
        <div style={{
          fontSize: 11, color: C.muted,
          padding: '4px 10px',
          background: C.surfaceAlt,
          border: `1px solid ${C.border}`,
          borderRadius: 20,
          fontWeight: 500,
        }}>
          Read-only access
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 24,
          background: C.surfaceAlt,
          borderRadius: 10, padding: 4,
          width: 'fit-content',
        }}>
          {[['orders', '▦  Orders'], ['inventory', '◉  Inventory']].map(([key, label]) => (
            <button key={key} className="tab-btn" onClick={() => handleTabSwitch(key)} style={{
              background: tab === key ? C.surface : 'transparent',
              border: 'none', cursor: 'pointer',
              padding: '7px 18px', borderRadius: 7,
              fontSize: 13, fontWeight: tab === key ? 600 : 500,
              color: tab === key ? C.text : C.muted,
              boxShadow: tab === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>

        {/* Search bar */}
        <div style={{
          background: C.surface, borderRadius: 12,
          border: `1px solid ${C.border}`,
          padding: '16px 20px', marginBottom: 20,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                color: C.muted, fontSize: 16, pointerEvents: 'none',
              }}>🔍</span>
              <input
                ref={inputRef}
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder={tab === 'orders'
                  ? 'Search by order number or reference no...'
                  : 'Search by SKU...'}
                style={{
                  width: '100%', padding: '10px 12px 10px 38px',
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8, color: C.text, fontSize: 14,
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
              />
            </div>

            {tab === 'orders' && (
              <div style={{
                display: 'flex', gap: 0,
                border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden',
                background: C.bg,
              }}>
                {[['all','All'], ['standard','Standard'], ['kitting','Kitting']].map(([val, label]) => (
                  <button key={val} type="button"
                    onClick={() => { setOrderType(val); search(searchQ, val); }}
                    style={{
                      background: orderType === val ? C.accentDim : 'transparent',
                      border: 'none', cursor: 'pointer',
                      padding: '9px 14px',
                      fontSize: 13, fontWeight: orderType === val ? 600 : 400,
                      color: orderType === val ? C.accentText : C.muted,
                      borderRight: `1px solid ${C.border}`,
                    }}>{label}</button>
                ))}
              </div>
            )}

            <button type="submit" style={{
              background: C.accent, border: 'none', borderRadius: 8,
              padding: '10px 20px', cursor: 'pointer',
              color: '#fff', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 1px 3px rgba(37,99,235,0.3)',
            }}>
              {loading ? <Spinner /> : null}
              Search
            </button>
          </form>
        </div>

        {/* Warehouse status pills */}
        {tab === 'inventory' && searched && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {Object.entries(warehouseStatus).map(([wh, status]) => (
                <span key={wh} style={{
                  fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 500,
                  background: status === 'ok' ? C.successBg : C.dangerBg,
                  color: status === 'ok' ? C.success : C.danger,
                  border: `1px solid ${status === 'ok' ? '#A7F3D0' : '#FECACA'}`,
                }}>
                  {wh}: {status}
                </span>
              ))}
            </div>
            {/* 库存筛选栏 */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={invSearch}
                onChange={e => { setInvSearch(e.target.value); setInvPage(1); }}
                placeholder="Filter by SKU..."
                style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.bg, color: C.text, width: 200 }}
              />
              {[['all','All Warehouses'],['ECCANG','ECCANG only'],['C0000001174','JDL SYD'],['C0000001901','JDL MEL']].map(([v,l]) => (
                <button key={v} onClick={() => { setInvFilter(v); setInvPage(1); }} style={{
                  padding: '7px 14px', borderRadius: 8, border: `1px solid ${invFilter===v ? C.accent : C.border}`,
                  background: invFilter===v ? C.accentDim : C.surface, color: invFilter===v ? C.accentText : C.muted,
                  fontWeight: invFilter===v ? 600 : 400, fontSize: 13, cursor: 'pointer',
                }}>{l}</button>
              ))}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.muted, cursor: 'pointer' }}>
                <input type="checkbox" checked={hideZero} onChange={e => { setHideZero(e.target.checked); setInvPage(1); }} />
                Hide zero stock
              </label>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            background: C.dangerBg, border: `1px solid #FECACA`,
            borderRadius: 8, padding: '12px 16px',
            color: C.danger, fontSize: 13, marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Orders table */}
        {tab === 'orders' && searched && !loading && (() => {
          const q = orderSearch.trim().toLowerCase();
          const filteredOrders = q
            ? orders.filter(o =>
                (o.order_number || '').toLowerCase().includes(q) ||
                (o.reference_no || '').toLowerCase().includes(q)
              )
            : orders;
          const pagedOrders = filteredOrders.slice((orderPage-1)*PAGE_SIZE, orderPage*PAGE_SIZE);
          return (
          <div style={{ animation: 'fadeIn 0.2s ease' }}>
            {filteredOrders.length === 0 ? (
              <div style={{
                textAlign: 'center', color: C.muted, padding: '64px 0',
                background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
                <div style={{ fontSize: 14 }}>No orders found</div>
              </div>
            ) : (
              <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>
                    {filteredOrders.length} result{filteredOrders.length !== 1 ? 's' : ''}
                  </span>
                  <input
                    value={orderSearch}
                    onChange={e => { setOrderSearch(e.target.value); setOrderPage(1); }}
                    placeholder="Filter by order / reference..."
                    style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, background: C.bg, color: C.text, width: 220 }}
                  />
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.surfaceAlt, borderBottom: `1px solid ${C.border}` }}>
                      {['Order No.', 'Reference', 'Type', 'Client', 'Warehouse', 'Status', 'Tracking', 'Created'].map(h => (
                        <th key={h} style={{
                          padding: '10px 16px', textAlign: 'left',
                          color: C.muted, fontWeight: 600, fontSize: 11,
                          letterSpacing: '0.05em', textTransform: 'uppercase',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedOrders.map(order => (
                      <>
                        <tr
                          key={order.id}
                          className="row-hover"
                          onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                          style={{
                            borderBottom: `1px solid ${C.border}`,
                            background: expandedOrder === order.id ? C.surfaceAlt : C.surface,
                          }}
                        >
                          <td style={{ padding: '12px 16px', color: C.accent, fontWeight: 600 }}>{order.order_number}</td>
                          <td style={{ padding: '12px 16px', color: C.dimmed }}>{order.reference_no || <span style={{ color: C.border }}>—</span>}</td>
                          <td style={{ padding: '12px 16px' }}><TypeTag type={order.order_type} /></td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: 12, fontWeight: 500, color: C.dimmed }}>{order.client}</span>
                          </td>
                          <td style={{ padding: '12px 16px', color: C.dimmed, fontSize: 12 }}>{order.warehouse}</td>
                          <td style={{ padding: '12px 16px' }}><Badge status={order.status} /></td>
                          <td style={{ padding: '12px 16px', color: C.muted, fontSize: 12, fontFamily: 'monospace' }}>
                            {order.tracking_number || <span style={{ color: C.border, fontFamily: 'inherit' }}>—</span>}
                          </td>
                          <td style={{ padding: '12px 16px', color: C.muted, fontSize: 12 }}>
                            {order.created_at ? new Date(order.created_at).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                        </tr>
                        {expandedOrder === order.id && (
                          <tr key={`${order.id}-detail`}>
                            <td colSpan={8} style={{ background: '#F8FAFF', borderBottom: `1px solid ${C.border}`, padding: '20px 24px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                                {order.order_items?.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Line Items</div>
                                    {order.order_items.map((item, i) => (
                                      <div key={i} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13,
                                      }}>
                                        <span style={{ color: C.accent, fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>{item.sku}</span>
                                        <span style={{ color: C.dimmed, flex: 1, margin: '0 12px' }}>{item.product_name}</span>
                                        <span style={{ fontWeight: 600, color: C.text }}>×{item.quantity}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {order.ship_to_name && (
                                  <div>
                                    <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Ship To</div>
                                    <div style={{ fontSize: 13, color: C.dimmed }}>{order.ship_to_name}</div>
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
                <Pagination page={orderPage} total={filteredOrders.length} pageSize={PAGE_SIZE} onChange={setOrderPage} />
              </div>
            )}
          </div>
          );
        })()}
        {/* Inventory table */}
        {tab === 'inventory' && searched && !loading && (() => {
          // 过滤逻辑
          const qSku = invSearch.trim().toLowerCase();
          const filteredInv = inventory.filter(item =>
            !qSku || (item.sku || '').toLowerCase().includes(qSku)
          );

          // 展开成扁平行（每仓库一行）
          const rows = [];
          filteredInv.forEach(item => {
            const entries = item.warehouses
              ? Object.entries(item.warehouses)
              : [[item.warehouse_code || item.warehouse || '—', item]];
            entries.forEach(([whName, wh]) => {
              if (invFilter !== 'all' && whName !== invFilter) return;
              if (hideZero && !(wh.sellable || wh.reserved || wh.onway)) return;
              rows.push({
                sku:     item.sku,
                wh:      whName,
                s:       wh.sellable  || 0,
                r:       wh.reserved  || 0,
                o:       wh.onway     || 0,
                t:       (wh.sellable || 0) + (wh.reserved || 0),
              });
            });
          });

          const pagedRows = rows.slice((invPage-1)*PAGE_SIZE, invPage*PAGE_SIZE);

          return (
          <div style={{ animation: 'fadeIn 0.2s ease' }}>
            {rows.length === 0 ? (
              <div style={{
                textAlign: 'center', color: C.muted, padding: '64px 0',
                background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
                <div style={{ fontSize: 14 }}>No inventory found</div>
              </div>
            ) : (
              <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.muted, fontWeight: 500 }}>
                  {rows.length} row{rows.length !== 1 ? 's' : ''}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.surfaceAlt, borderBottom: `1px solid ${C.border}` }}>
                      {['SKU', 'Warehouse', 'Sellable', 'Reserved', 'On-way', 'Total'].map(h => (
                        <th key={h} style={{
                          padding: '10px 16px', textAlign: 'left',
                          color: C.muted, fontWeight: 600, fontSize: 11,
                          letterSpacing: '0.05em', textTransform: 'uppercase',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row, i) => {
                      const isJDL = row.wh !== 'ECCANG';
                      const whColor = isJDL ? C.accent : '#7C3AED';
                      const prevRow = pagedRows[i-1];
                      const isFirst = !prevRow || prevRow.sku !== row.sku;
                      return (
                        <tr key={i} className="row-hover" style={{
                          borderBottom: `1px solid ${C.border}`,
                          borderTop: isFirst && i > 0 ? `2px solid ${C.border}` : 'none',
                        }}>
                          <td style={{ padding: '10px 16px', fontFamily: 'monospace', color: C.accent, fontWeight: 600, fontSize: 12, opacity: isFirst ? 1 : 0.3 }}>
                            {isFirst ? row.sku : ''}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{
                              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                              background: isJDL ? C.accentDim : '#F5F3FF',
                              color: whColor,
                              border: `1px solid ${isJDL ? '#BFDBFE' : '#DDD6FE'}`,
                            }}>{row.wh}</span>
                          </td>
                          <td style={{ padding: '10px 16px', fontWeight: 600, color: row.s > 0 ? C.success : C.muted }}>{row.s}</td>
                          <td style={{ padding: '10px 16px', color: row.r > 0 ? C.warning : C.muted }}>{row.r}</td>
                          <td style={{ padding: '10px 16px', color: row.o > 0 ? C.accent : C.muted }}>{row.o}</td>
                          <td style={{ padding: '10px 16px', fontWeight: 700, color: C.text }}>{row.t}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pagination page={invPage} total={rows.length} pageSize={PAGE_SIZE} onChange={setInvPage} />
                <div style={{ display: 'flex', gap: 16, padding: '12px 20px', borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.muted }}>
                  <span><span style={{ color: C.success, fontWeight: 700 }}>■</span> Sellable 可用</span>
                  <span><span style={{ color: C.warning, fontWeight: 700 }}>■</span> Reserved 预占</span>
                  <span><span style={{ color: C.accent, fontWeight: 700 }}>■</span> On-way 待入库</span>
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {/* Empty state */}
        {!searched && !loading && (
          <div style={{
            textAlign: 'center', padding: '80px 0',
            background: C.surface, borderRadius: 12,
            border: `1px dashed ${C.borderHi}`,
          }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>
              {tab === 'orders' ? '📦' : '📊'}
            </div>
            <div style={{ fontSize: 15, color: C.muted, fontWeight: 500, marginBottom: 6 }}>
              {tab === 'orders' ? 'Search for orders' : 'Search for inventory'}
            </div>
            <div style={{ fontSize: 13, color: C.borderHi }}>
              {tab === 'orders'
                ? 'Enter an order number or reference number above'
                : 'Enter a SKU to view stock across both warehouses'}
            </div>
          </div>
        )}

      </main>
    </>
  );
}
