import { useState, useEffect } from 'react';
import Head from 'next/head';

const C = {
  bg: '#F8F9FA', surface: '#FFFFFF', surfaceAlt: '#F1F5F9',
  border: '#E2E8F0', accent: '#2563EB', accentDim: '#DBEAFE',
  text: '#0F172A', muted: '#64748B', success: '#059669',
  successBg: '#ECFDF5', danger: '#DC2626', dangerBg: '#FEF2F2',
  warning: '#D97706', warningBg: '#FFFBEB',
};


const C_PAGE = { border: '#E2E8F0', accent: '#2563EB', muted: '#475569', bg: '#fff' };
function Pagination({ page: currentPage, total, pageSize, onChange }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const pages = [];
  let start = Math.max(1, currentPage - 3);
  let end   = Math.min(totalPages, start + 6);
  if (end - start < 6) start = Math.max(1, end - 6);
  for (let i = start; i <= end; i++) pages.push(i);
  const btn = (active) => ({
    padding: '5px 10px', borderRadius: 6, border: `1px solid ${active ? C_PAGE.accent : C_PAGE.border}`,
    background: active ? C_PAGE.accent : C_PAGE.bg, color: active ? '#fff' : C_PAGE.muted,
    fontWeight: active ? 700 : 400, fontSize: 12, cursor: 'pointer',
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: `1px solid ${C_PAGE.border}` }}>
      <span style={{ fontSize: 12, color: C_PAGE.muted }}>{((currentPage-1)*pageSize)+1}–{Math.min(currentPage*pageSize,total)} of {total}</span>
      <div style={{ display: 'flex', gap: 3 }}>
        <button onClick={() => onChange(1)}               disabled={currentPage===1}           style={btn(false)}>«</button>
        <button onClick={() => onChange(currentPage-1)}   disabled={currentPage===1}           style={btn(false)}>‹</button>
        {pages.map(p => <button key={p} onClick={() => onChange(p)} style={btn(p===currentPage)}>{p}</button>)}
        <button onClick={() => onChange(currentPage+1)}   disabled={currentPage===totalPages}  style={btn(false)}>›</button>
        <button onClick={() => onChange(totalPages)}      disabled={currentPage===totalPages}  style={btn(false)}>»</button>
      </div>
    </div>
  );
}

// ── Login Screen ──────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Login failed');
      localStorage.setItem('2sa_token', json.token);
      localStorage.setItem('2sa_user',  JSON.stringify(json.user));
      onLogin(json.token, json.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 40, width: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div style={{ width: 40, height: 40, background: C.accent, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16 }}>2S</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>2SA Admin</div>
            <div style={{ fontSize: 12, color: C.muted }}>Management Portal</div>
          </div>
        </div>

        {error && (
          <div style={{ background: C.dangerBg, border: `1px solid #FECACA`, borderRadius: 8, padding: '10px 14px', color: C.danger, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: C.text, display: 'block', marginBottom: 6 }}>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.text, background: C.bg, boxSizing: 'border-box' }}
              placeholder="2sa-admin" autoFocus />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: C.text, display: 'block', marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.text, background: C.bg, boxSizing: 'border-box' }}
              placeholder="••••••••" />
          </div>
          <button type="submit" disabled={loading} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginTop: 4 }}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Order Upload ───────────────────────────────────────────────
function OrderUpload({ token }) {
  const [csvText,  setCsvText]  = useState('');
  const [results,  setResults]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result);
    reader.readAsText(file);
  };

  const parseCSV = (text) => {
    const lines  = text.trim().split('\n');
    const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    return lines.slice(1).filter(l => l.trim()).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const obj  = {};
      header.forEach((h, i) => obj[h] = vals[i] || '');
      return obj;
    });
  };

  const handleUpload = async () => {
    setLoading(true); setError(''); setResults(null);
    try {
      const rows = parseCSV(csvText);
      if (!rows.length) throw new Error('No data found in CSV');

      const res  = await fetch('/api/orders/eccang', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({ orders: rows }),
      });
      const json = await res.json();
      setResults(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>Upload Orders</h2>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
          Upload a CSV file with columns: <code style={{ background: C.surfaceAlt, padding: '2px 6px', borderRadius: 4 }}>order_code, ref_code, tracking_number, carrier, status</code>
        </p>
        <input type="file" accept=".csv" onChange={handleFile} style={{ marginBottom: 12, fontSize: 13 }} />
        {csvText && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Preview ({parseCSV(csvText).length} rows):</div>
            <pre style={{ fontSize: 11, background: C.surfaceAlt, padding: 12, borderRadius: 8, maxHeight: 150, overflow: 'auto', color: C.text }}>
              {csvText.split('\n').slice(0, 6).join('\n')}
            </pre>
          </div>
        )}
        {error && <div style={{ color: C.danger, fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}
        <button onClick={handleUpload} disabled={!csvText || loading}
          style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 13, cursor: csvText ? 'pointer' : 'not-allowed', opacity: csvText ? 1 : 0.5 }}>
          {loading ? 'Uploading...' : 'Upload Orders'}
        </button>
      </div>
      {results && (
        <div style={{ background: C.successBg, border: `1px solid #A7F3D0`, borderRadius: 8, padding: 16, fontSize: 13, color: C.success }}>
          ✅ Done: {results.created || 0} created, {results.updated || 0} updated, {results.failed || 0} failed
        </div>
      )}
    </div>
  );
}

// ── Bulk Tracking Update ───────────────────────────────────────
function TrackingUpdate({ token }) {
  const [csvText,  setCsvText]  = useState('');
  const [results,  setResults]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result);
    reader.readAsText(file);
  };

  const parseCSV = (text) => {
    const lines  = text.trim().split('\n');
    const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    return lines.slice(1).filter(l => l.trim()).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const obj  = {};
      header.forEach((h, i) => obj[h] = vals[i] || '');
      return obj;
    });
  };

  const handleUpdate = async () => {
    setLoading(true); setError(''); setResults(null);
    try {
      const rows  = parseCSV(csvText);
      const items = rows.map(r => ({
        order_code:       r.order_code || r.order_number,
        tracking_number:  r.tracking_number || r.tracking,
        carrier:          r.carrier || r.logistics_name || '',
      })).filter(r => r.order_code && r.tracking_number);

      if (!items.length) throw new Error('No valid rows (need order_code and tracking_number)');

      const res  = await fetch('/api/orders/update-tracking', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({ items }),
      });
      const json = await res.json();
      setResults(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>Bulk Update Tracking</h2>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
          CSV columns required: <code style={{ background: C.surfaceAlt, padding: '2px 6px', borderRadius: 4 }}>order_code, tracking_number</code> &nbsp;
          Optional: <code style={{ background: C.surfaceAlt, padding: '2px 6px', borderRadius: 4 }}>carrier</code>
        </p>
        <input type="file" accept=".csv" onChange={handleFile} style={{ marginBottom: 12, fontSize: 13 }} />
        {csvText && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
              {parseCSV(csvText).filter(r => (r.order_code || r.order_number) && (r.tracking_number || r.tracking)).length} valid rows
            </div>
            <pre style={{ fontSize: 11, background: C.surfaceAlt, padding: 12, borderRadius: 8, maxHeight: 120, overflow: 'auto', color: C.text }}>
              {csvText.split('\n').slice(0, 4).join('\n')}
            </pre>
          </div>
        )}
        {error && <div style={{ color: C.danger, fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}
        <button onClick={handleUpdate} disabled={!csvText || loading}
          style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 13, cursor: csvText ? 'pointer' : 'not-allowed', opacity: csvText ? 1 : 0.5 }}>
          {loading ? 'Updating...' : 'Update Tracking'}
        </button>
      </div>
      {results && (
        <div>
          <div style={{ background: results.failed === 0 ? C.successBg : C.warningBg, border: `1px solid ${results.failed === 0 ? '#A7F3D0' : '#FDE68A'}`, borderRadius: 8, padding: 12, fontSize: 13, color: results.failed === 0 ? C.success : C.warning, marginBottom: 12 }}>
            ✅ Updated: {results.updated} &nbsp;|&nbsp; ❌ Failed: {results.failed}
          </div>
          {results.results?.filter(r => !r.success).map((r, i) => (
            <div key={i} style={{ fontSize: 12, color: C.danger, padding: '4px 0' }}>
              ✗ {r.order_code}: {r.error || r.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Inventory View ─────────────────────────────────────────────
function InventoryView({ token }) {
  const [sku,     setSku]     = useState('');
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [searched,setSearched]= useState(false);
  const [total,   setTotal]   = useState(0);
  const [invCurPage, setInvCurPage] = useState(1);
  const PAGE_SIZE = 100;

  const search = async (fetchAll = false) => {
    setLoading(true); setError(''); setInvCurPage(1);
    try {
      const params = new URLSearchParams();
      if (sku.trim()) params.set('sku', sku.trim());
      // ECCANG 全量
      const eccangRes  = await fetch(`/api/warehouse/eccang/inventory?${params}`);
      const eccangJson = await eccangRes.json();
      // JDL 全量
      const jdlRes  = await fetch(`/api/warehouse/jdl/inventory?${params}`);
      const jdlJson = await jdlRes.json();

      // 合并：按 SKU 分组
      const skuMap = {};
      (eccangJson.data || []).forEach(item => {
        if (!skuMap[item.sku]) skuMap[item.sku] = { sku: item.sku, warehouses: {} };
        skuMap[item.sku].warehouses['ECCANG'] = item;
      });
      (jdlJson.data || []).forEach(item => {
        if (!skuMap[item.sku]) skuMap[item.sku] = { sku: item.sku, warehouses: {} };
        skuMap[item.sku].warehouses[item.warehouse_code || 'JDL'] = item;
      });

      const combined = Object.values(skuMap);
      setItems(combined);
      setTotal(combined.length);
      setSearched(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>Inventory — All Warehouses</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input value={sku} onChange={e => setSku(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Search by SKU (leave blank for all)..."
          style={{ flex: 1, padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: C.bg, color: C.text }} />
        <button onClick={() => search()} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {loading ? '...' : 'Search'}
        </button>
      </div>
      {error && <div style={{ color: C.danger, fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}
      {searched && !loading && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.muted }}>
            {total} SKUs across all warehouses
          </div>
          {items.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: C.muted, fontSize: 14 }}>No inventory found</div>
          ) : (
            <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.surfaceAlt }}>
                  {['SKU', 'Warehouse', 'Sellable', 'Reserved', 'On-way'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.slice((invCurPage-1)*PAGE_SIZE, invCurPage*PAGE_SIZE).flatMap((item, i) => {
                  const whEntries = Object.entries(item.warehouses);
                  return whEntries.map(([wh, data], j) => {
                    const isJDL = wh !== 'ECCANG';
                    return (
                      <tr key={`${i}-${j}`} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '8px 14px', fontFamily: 'monospace', color: C.accent, fontWeight: 600, opacity: j === 0 ? 1 : 0.3 }}>
                          {j === 0 ? item.sku : ''}
                        </td>
                        <td style={{ padding: '8px 14px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: isJDL ? C.accentDim : '#F5F3FF', color: isJDL ? C.accent : '#7C3AED', border: `1px solid ${isJDL ? '#BFDBFE' : '#DDD6FE'}` }}>{wh}</span>
                        </td>
                        <td style={{ padding: '8px 14px', fontWeight: 700, color: data.sellable > 0 ? C.success : C.muted }}>{data.sellable || 0}</td>
                        <td style={{ padding: '8px 14px', color: data.reserved > 0 ? C.warning : C.muted }}>{data.reserved || 0}</td>
                        <td style={{ padding: '8px 14px', color: data.onway > 0 ? C.accent : C.muted }}>{data.onway || 0}</td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
            <Pagination page={invCurPage} total={items.length} pageSize={PAGE_SIZE} onChange={setInvCurPage} />
            </>
          )}
        </div>
      )}
    </div>
  );
}


// ── JDL Order Search ───────────────────────────────────────────
function JdlOrderSearch({ token }) {
  const [q,         setQ]         = useState('');
  const [orders,    setOrders]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [searched,  setSearched]  = useState(false);
  const [ordCurPage, setOrdCurPage] = useState(1);
  const PAGE_SIZE = 100;

  const search = async () => {
    setLoading(true); setError(''); setSearched(true); setOrdCurPage(1);
    try {
      const params = new URLSearchParams(q.trim() ? { q: q.trim() } : { all: '1' });
      const res  = await fetch(`/api/orders/jdl?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || JSON.stringify(json.raw || {}));
      setOrders(json.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (s) => {
    const n = String(s || '').toLowerCase();
    if (n.includes('sign') || n.includes('完成') || n.includes('delivered')) return C.success;
    if (n.includes('out') || n.includes('出库') || n.includes('shipped')) return C.accent;
    if (n.includes('fail') || n.includes('失败') || n.includes('cancel')) return C.danger;
    return C.warning;
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>JDL Outbound Orders</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Customer order no. / reference (blank = all)..."
          style={{ flex: 1, padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: C.bg, color: C.text }} />
        <button onClick={search} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {loading ? '...' : 'Search'}
        </button>
      </div>
      {error && (
        <div style={{ background: C.dangerBg, border: `1px solid #FECACA`, borderRadius: 8, padding: '10px 14px', color: C.danger, fontSize: 13, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}
      {searched && !loading && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.muted }}>
            {orders.length} orders
          </div>
          {orders.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: C.muted, fontSize: 14 }}>No JDL orders found</div>
          ) : (
            <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.surfaceAlt }}>
                  {['JDL Bill Code', 'Customer Order No.', 'Warehouse', 'Status', 'Carrier', 'Tracking', 'Items', 'Outbound'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.slice((ordCurPage-1)*PAGE_SIZE, ordCurPage*PAGE_SIZE).map((o, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '10px 14px', color: C.accent, fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>{o.order_number || '—'}</td>
                    <td style={{ padding: '10px 14px', color: C.muted, fontSize: 12 }}>{o.reference_no || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{o.warehouse || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: `${statusColor(o.status)}22`, color: statusColor(o.status) }}>
                        {o.status || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{o.carrier || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'monospace', color: C.muted }}>{o.tracking_number || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>
                      {o.order_items?.map(it => `${it.sku}×${it.qty_actual||it.quantity}`).join(', ') || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>
                      {o.outbound_at ? String(o.outbound_at).slice(0,10) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={ordCurPage} total={orders.length} pageSize={PAGE_SIZE} onChange={setOrdCurPage} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Order Search ───────────────────────────────────────────────
function OrderSearch({ token }) {
  const [q,       setQ]       = useState('');
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [searched,setSearched]= useState(false);
  const [ordCurPage, setOrdCurPage] = useState(1);
  const PAGE_SIZE = 100;

  const search = async () => {
    setLoading(true); setError(''); setSearched(true); setOrdCurPage(1);
    try {
      const params = new URLSearchParams(q ? { pageSize: '50' } : { all: '1' });
      if (q) params.set('q', q);
      const res  = await fetch(`/api/orders/eccang?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setOrders(json.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>Order Search (ECCANG Live)</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Order number or reference..."
          style={{ flex: 1, padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: C.bg, color: C.text }} />
        <button onClick={search} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {loading ? '...' : 'Search'}
        </button>
      </div>
      {error && <div style={{ color: C.danger, fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}
      {searched && !loading && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.muted }}>
            {orders.length} orders
          </div>
          {orders.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: C.muted, fontSize: 14 }}>No orders found</div>
          ) : (
            <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.surfaceAlt }}>
                  {['Order No.', 'Ref', 'Status', 'Carrier', 'Tracking', 'Ship To', 'Created'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.slice((ordCurPage-1)*PAGE_SIZE, ordCurPage*PAGE_SIZE).map((o, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '10px 14px', color: C.accent, fontWeight: 600 }}>{o.order_number}</td>
                    <td style={{ padding: '10px 14px', color: C.muted, fontSize: 12 }}>{o.reference_no || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: C.surfaceAlt, color: C.text }}>{o.status || '—'}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{o.carrier || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'monospace', color: C.muted }}>{o.tracking_number || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{o.ship_to_name || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{o.created_at?.slice(0,10) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={ordCurPage} total={orders.length} pageSize={PAGE_SIZE} onChange={setOrdCurPage} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Admin Page ────────────────────────────────────────────
export default function AdminPage() {
  const [token,   setToken]   = useState(null);
  const [user,    setUser]    = useState(null);
  const [section, setSection] = useState('orders');

  useEffect(() => {
    const t = localStorage.getItem('2sa_token');
    const u = localStorage.getItem('2sa_user');
    if (t && u) { setToken(t); setUser(JSON.parse(u)); }
  }, []);

  if (!token) return <LoginScreen onLogin={(t, u) => { setToken(t); setUser(u); }} />;

  const logout = () => {
    localStorage.removeItem('2sa_token');
    localStorage.removeItem('2sa_user');
    setToken(null); setUser(null);
  };

  const nav = [
    { key: 'orders',     label: '📦 ECCANG Orders' },
    { key: 'jdl_orders', label: '🚢 JDL Orders' },
    { key: 'inventory',  label: '📊 Inventory' },
    { key: 'upload',     label: '⬆️ Upload Orders' },
    { key: 'tracking',   label: '🚚 Update Tracking' },
  ];

  return (
    <>
      <Head><title>2SA Admin</title></Head>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } body { background: ${C.bg}; color: ${C.text}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }`}</style>

      <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, background: C.accent, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>2S</div>
          <div>
            <span style={{ fontWeight: 600, fontSize: 14 }}>2SA Admin</span>
            <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>Management Portal</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: C.muted }}>👤 {user?.username}</span>
          <a href="/" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>Client Portal →</a>
          <button onClick={logout} style={{ fontSize: 12, color: C.danger, background: 'none', border: `1px solid #FECACA`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>Logout</button>
        </div>
      </header>

      <div style={{ display: 'flex', maxWidth: 1200, margin: '0 auto' }}>
        {/* Sidebar */}
        <nav style={{ width: 220, padding: '24px 16px', borderRight: `1px solid ${C.border}`, minHeight: 'calc(100vh - 56px)' }}>
          {nav.map(({ key, label }) => (
            <button key={key} onClick={() => setSection(key)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: section === key ? 600 : 400, background: section === key ? C.accentDim : 'transparent', color: section === key ? C.accent : C.muted, marginBottom: 4 }}>
              {label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main style={{ flex: 1, padding: '32px 32px' }}>
          {section === 'orders'     && <OrderSearch    token={token} />}
          {section === 'jdl_orders' && <JdlOrderSearch token={token} />}
          {section === 'inventory'  && <InventoryView  token={token} />}
          {section === 'upload'     && <OrderUpload    token={token} />}
          {section === 'tracking'   && <TrackingUpdate token={token} />}
        </main>
      </div>
    </>
  );
}
