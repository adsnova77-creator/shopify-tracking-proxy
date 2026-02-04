/**
 * Shopify Tracking Init – Vercel Serverless Function
 *
 * Haalt officiële Shopify tracking tokens op via de Storefront API.
 * Zet _shopify_y (uniqueToken) en _shopify_s (visitToken) als cookies.
 * Vereist voor Live View in headless storefronts.
 *
 * Endpoint: GET/POST /api/tracking-init
 */

export const config = { runtime: 'edge' };

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

function getCorsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const allowed = getAllowedOrigins();
  const allowOrigin = allowed.length && allowed.includes(origin) ? origin : (allowed[0] || '*');

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Cookie',
    'Access-Control-Allow-Credentials': 'true',
  };
}

async function handleRequest(request) {
  const corsHeaders = getCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return Response.json(
      { error: 'Method not allowed' },
      { status: 405, headers: corsHeaders }
    );
  }

  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_STOREFRONT_TOKEN;
  const cookieDomain = process.env.COOKIE_DOMAIN || '';

  if (!storeDomain || !token) {
    console.error('Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_STOREFRONT_TOKEN');
    return Response.json(
      { error: 'Server misconfigured' },
      { status: 500, headers: corsHeaders }
    );
  }

  const cookieHeader = request.headers.get('cookie') || '';
  let uniqueToken = getCookieValue(cookieHeader, '_shopify_y');
  let visitToken = getCookieValue(cookieHeader, '_shopify_s');
  if (!uniqueToken) uniqueToken = generateUUID();
  if (!visitToken) visitToken = generateUUID();

  const apiUrl = `https://${storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/api/2026-01/graphql.json`;

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

    const url = new URL(request.url);
    const isSecure =
      url.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';

    const headers = new Headers(corsHeaders);
    headers.set(
      'Set-Cookie',
      `_shopify_y=${encodeURIComponent(finalUniqueToken)}; Max-Age=31536000; Path=/; SameSite=Lax${isSecure ? '; Secure' : ''}${cookieDomain ? `; Domain=${cookieDomain}` : ''}`
    );
    headers.append(
      'Set-Cookie',
      `_shopify_s=${encodeURIComponent(finalVisitToken)}; Max-Age=1800; Path=/; SameSite=Lax${isSecure ? '; Secure' : ''}${cookieDomain ? `; Domain=${cookieDomain}` : ''}`
    );
    headers.set('Cache-Control', 'no-store');

    return Response.json(
      {
        uniqueToken: finalUniqueToken,
        visitToken: finalVisitToken,
      },
      { headers }
    );
  } catch (err) {
    console.error('Tracking init error:', err);
    return Response.json(
      { error: 'Failed to initialize tracking' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Vercel: named exports voor GET/POST
export async function GET(request) {
  return handleRequest(request);
}

export async function POST(request) {
  return handleRequest(request);
}

export async function OPTIONS(request) {
  return handleRequest(request);
}
