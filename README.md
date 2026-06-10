# BeanBooks

A lightweight, client-side bookkeeping app for small businesses (built with
React + Vite). It handles invoices, expenses, customers, a general ledger, and
financial reports (P&L, balance sheet, tax package), all in the browser.

## Local development

```bash
npm install
npm run dev
```

Then open the printed local URL (default http://localhost:5173).

## Production build

```bash
npm run build      # outputs to dist/
npm run preview    # serve the built app locally
```

## Deploying to Vercel

This repo is a standard Vite app and deploys to Vercel with no extra
configuration:

1. Push this repository to GitHub.
2. In Vercel, **Add New… → Project** and import this repo.
3. Vercel auto-detects the framework as **Vite**:
   - Build command: `vite build`
   - Output directory: `dist`
   - Install command: `npm install`
4. Click **Deploy**.

A `vercel.json` is included that pins the framework and SPA rewrites, so the
defaults above are applied automatically.

## A note on the AI features

The **Import** and **Gmail scan** features call the Anthropic API
(`api.anthropic.com`) directly from the browser. These were designed to run
inside an environment that proxies that endpoint and will not work on a plain
static Vercel deployment (browsers cannot safely hold an API key, and the
endpoint requires authentication + CORS). Everything else — invoices,
expenses, customers, the ledger, reports, and CSV/spreadsheet import — works
fully client-side. To enable the AI features in production you would add a
small serverless function (e.g. a Vercel function) that injects your
`ANTHROPIC_API_KEY` and proxies the request.
