# Shopify Tracking Proxy

Minimale Node.js serverless proxy voor officiële Shopify tracking cookies. Haalt `uniqueToken` en `visitToken` op via de Storefront API en zet deze als `_shopify_y` en `_shopify_s` cookies. Vereist voor **Live View** in headless storefronts.

## Deployment naar Vercel

### 1. Vercel account en CLI

```bash
npm i -g vercel
vercel login
```

### 2. Deploy

```bash
cd tracking-proxy
vercel
```

### 3. Environment variables

In Vercel Dashboard → Project → Settings → Environment Variables:

| Variable                 | Waarde                     |
| ----------------------- | -------------------------- |
| `SHOPIFY_STORE_DOMAIN`  | `jouw-winkel.myshopify.com` |
| `SHOPIFY_STOREFRONT_TOKEN` | Jouw Storefront API token |
| `COOKIE_DOMAIN`         | `.novadecor.nl`            |
| `ALLOWED_ORIGINS`       | `https://novadecor.nl,https://www.novadecor.nl` |

### 4. Custom domain (optioneel)

Voor cookies op je eigen domein: Vercel → Project → Settings → Domains → voeg `api.novadecor.nl` toe. Zet dan `COOKIE_DOMAIN=.novadecor.nl`.

### 5. Frontend configureren

In `js/shopify-config.js`:

```javascript
window.SHOPIFY_CONFIG = {
  // ... bestaande config ...
  trackingProxyUrl: 'https://jouw-project.vercel.app'  // of https://api.novadecor.nl
};
```

## Lokaal testen

```bash
cd tracking-proxy
cp .env.example .env
# Vul .env in met je Shopify gegevens
vercel dev
```

Test: `curl http://localhost:3000/api/tracking-init`

## Endpoints

### GET/POST `/api/tracking-init`

Haalt officiële Shopify tracking tokens op. Retourneert `{ uniqueToken, visitToken }` en zet cookies `_shopify_y` en `_shopify_s`.

## Bron

[GitHub – shopify-tracking-proxy](https://github.com/adsnova77-creator/shopify-tracking-proxy)
