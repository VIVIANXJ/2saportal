#!/usr/bin/env node
/**
 * JDL iFOP API Tester
 * ====================
 * Tests the confirmed iFOP inventory endpoints from the official
 * "海外仓配业务介绍" document.
 *
 * Run:
 *   JDL_APP_KEY=xxx JDL_APP_SECRET=xxx JDL_ACCESS_TOKEN=548b35... node scripts/test-jdl.js
 *
 * Or with .env.local:
 *   node -r dotenv/config scripts/test-jdl.js
 */

const crypto = require('crypto');

const APP_KEY      = process.env.JDL_APP_KEY      || 'YOUR_APP_KEY';
const APP_SECRET   = process.env.JDL_APP_SECRET   || 'YOUR_APP_SECRET';
const ACCESS_TOKEN = process.env.JDL_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN';
const BASE_URL     = process.env.JDL_BASE_URL     || 'https://api.jdl.com';

// Confirmed from official iFOP doc
const ENDPOINTS = [
  { name: 'Stock by warehouse (接口9)', path: '/fop/open/stockprovider/querystockwarehouselistbypage' },
  { name: 'Stock by batch (接口10)',     path: '/fop/open/stockprovider/querystockbatchwarehouselistbypage' },
  { name: 'Query warehouse info (接口16)', path: '/fop/open/querywarehouseinfoprovider/querywarehouseinfo' },
  { name: 'Query goods (接口2)',          path: '/fop/open/querygoodsprovider/querypage' },
];

function getTimestamp() {
  const t = new Date(Date.now() + 8 * 3600 * 1000);
  return t.toISOString().replace('T', ' ').slice(0, 19);
}

function buildSign(params, secret) {
  const content = secret
    + Object.keys(params).sort().map(k => `${k}${params[k]}`).join('')
    + secret;
  return crypto.createHash('md5').update(content, 'utf8').digest('hex').toUpperCase();
}

async function callIfop(path, body = {}) {
  const timestamp = getTimestamp();
  const urlParams = { app_key: APP_KEY, access_token: ACCESS_TOKEN, timestamp, v: '2.0' };
  const sign = buildSign({ ...urlParams, ...body }, APP_SECRET);

  const url = new URL(path, BASE_URL);
  Object.entries({ ...urlParams, sign }).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, data: json };
}

async function main() {
  console.log('\n=== JDL iFOP API Tester ===\n');
  console.log(`BASE_URL:      ${BASE_URL}`);
  console.log(`APP_KEY:       ${APP_KEY}`);
  console.log(`ACCESS_TOKEN:  ${ACCESS_TOKEN.substring(0, 8)}...`);
  console.log(`APP_SECRET:    ${APP_SECRET !== 'YOUR_APP_SECRET' ? APP_SECRET.substring(0, 6) + '...' : '⚠ NOT SET'}\n`);

  for (const ep of ENDPOINTS) {
    process.stdout.write(`\n[${ep.name}]\n  ${ep.path}\n  → `);
    try {
      const { status, data } = await callIfop(ep.path, { pageNum: 1, pageSize: 1 });
      const code = data?.code;
      const msg  = data?.message || data?.msg || '';

      if (code === 200 || code === '200') {
        const count   = data?.data?.total ?? data?.data?.records?.length ?? '?';
        const sample  = data?.data?.records?.[0];
        console.log(`✅ SUCCESS — total records: ${count}`);
        if (sample) {
          console.log('  Sample record fields:', Object.keys(sample).join(', '));
          console.log('  Sample values:', JSON.stringify(sample, null, 2).split('\n').slice(0, 12).join('\n  '));
        }
      } else if (code === 401 || msg?.toLowerCase().includes('token') || msg?.toLowerCase().includes('auth')) {
        console.log(`❌ AUTH FAILED (code=${code}): ${msg}`);
        console.log('  → access_token may be invalid or expired.');
      } else if (code === 403 || msg?.toLowerCase().includes('permission')) {
        console.log(`⛔ NO PERMISSION (code=${code}): ${msg}`);
      } else {
        console.log(`⚠  code=${code}: ${msg}`);
        if (APP_SECRET === 'YOUR_APP_SECRET') {
          console.log('  → APP_SECRET not set, signature will fail.');
        }
      }
    } catch (e) {
      console.log(`💥 ${e.message}`);
    }
  }
  console.log('\n');
}

main().catch(console.error);
