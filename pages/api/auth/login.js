import crypto from 'crypto';

const ADMIN_USER = process.env.ADMIN_USERNAME || '2sa-admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET     || 'change-me-in-production';

export function makeToken(username) {
  const payload = Buffer.from(JSON.stringify({
    sub: username, role: 'admin', iat: Date.now(), exp: Date.now() + 86400000
  })).toString('base64');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyToken(token) {
  try {
    const [payload, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
    if (sig !== expected) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64').toString());
    if (Date.now() > data.exp) return null;
    return data;
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (!ADMIN_PASS) return res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });
  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  return res.status(200).json({
    success: true, token: makeToken(username),
    user: { username, role: 'admin' },
  });
}
