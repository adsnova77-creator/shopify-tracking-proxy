/**
 * Shopify Tracking Init – Vercel Serverless Function (Node.js)
 *
 * Haalt officiële Shopify tracking tokens op via de Storefront API.
 * Zet _shopify_y (uniqueToken) en _shopify_s (visitToken) als cookies.
 * Vereist voor Live View in headless storefronts.
 *
 * Endpoint: GET/POST /api/tracking-init
 */

const SHOPIFY_UNIQUE_TOKEN_HEADER = 'Shopify-Unique-Token';
const SHOPIFY_VISIT_TOKEN_HEADER = 'Shopify-Visit-Token';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function extractServerTiming(serverTimingHeader) {
  const values = {};
  if (!serverTimingHeader) return values;
  const re = /\b(_y|_s|_cmp);desc="?([^",]+)"?/g;
  let match;
  while ((match = re.exec(serverTimingHeader)) !== null) {
    values[match[1]] = match[2];
  }
  return values;
}

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`\\b${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1].trim()) : null;
}

function getAllowedOrigins() {
  const env = process.env.ALLOWED_ORIGINS || '';
  return env.split(',').map((o) => o.trim()).filter(Boolean);
}

function getCorsHeaders(req) {
  const origin = req.headers.origin || req.headers.referer || '';
  const allowed = getAllowedOrigins();
  const allowOrigin = allowed.length && origin && allowed.includes(origin) ? origin : (allowed[0] || '*');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Cookie',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function sendJson(res, status, data, corsHeaders) {
  res.writeHead(status, { ...corsHeaders, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' }, corsHeaders);
    return;
  }

  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_STOREFRONT_TOKEN;
  const cookieDomain = process.env.COOKIE_DOMAIN || '';

  if (!storeDomain || !token) {
    sendJson(res, 500, { error: 'Server misconfigured: set SHOPIFY_STORE_DOMAIN and SHOPIFY_STOREFRONT_TOKEN in Vercel' }, corsHeaders);
    return;
  }

  const cookieHeader = req.headers.cookie || '';
  let uniqueToken = getCookieValue(cookieHeader, '_shopify_y');
  let visitToken = getCookieValue(cookieHeader, '_shopify_s');
  if (!uniqueToken) uniqueToken = generateUUID();
  if (!visitToken) visitToken = generateUUID();

  const cleanDomain = storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const apiUrl = `https://${cleanDomain}/api/2024-10/graphql.json`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
        [SHOPIFY_UNIQUE_TOKEN_HEADER]: uniqueToken,
        [SHOPIFY_VISIT_TOKEN_HEADER]: visitToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        query: '{ shop { name } }',
        variables: {},
      }),
    });

    const serverTiming = response.headers.get('server-timing');
    const tracking = extractServerTiming(serverTiming);

    const finalUniqueToken = tracking._y || uniqueToken;
    const finalVisitToken = tracking._s || visitToken;

    const isSecure = req.headers['x-forwarded-proto'] === 'https';
    const setCookieY = `_shopify_y=${encodeURIComponent(finalUniqueToken)}; Max-Age=31536000; Path=/; SameSite=Lax${isSecure ? '; Secure' : ''}${cookieDomain ? `; Domain=${cookieDomain}` : ''}`;
    const setCookieS = `_shopify_s=${encodeURIComponent(finalVisitToken)}; Max-Age=1800; Path=/; SameSite=Lax${isSecure ? '; Secure' : ''}${cookieDomain ? `; Domain=${cookieDomain}` : ''}`;

    res.writeHead(200, {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': [setCookieY, setCookieS],
    });
    res.end(JSON.stringify({
      uniqueToken: finalUniqueToken,
      visitToken: finalVisitToken,
    }));
  } catch (err) {
    console.error('Tracking init error:', err);
    sendJson(res, 500, { error: 'Failed to initialize tracking', detail: err.message }, corsHeaders);
  }
}
