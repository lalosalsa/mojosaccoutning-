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

## Accounts & data storage

Sign-in requires an **email and password**. Accounts and all bookkeeping data
(businesses, invoices, expenses, customers, ledger, settings) are saved in the
browser's `localStorage` on the device. Notes:

- The first time an email is used, you set a password to create the account.
  Returning to that email asks for the password to sign in.
- Passwords are hashed (SHA-256 with a per-account salt) before being stored —
  the plain password is never persisted.
- Because storage is local to the browser, data does **not** sync across
  devices or browsers, and clearing site data removes it. This is a deliberate,
  zero-backend setup. To get real cloud accounts and cross-device sync, swap the
  storage/auth layer for a backend such as Supabase.

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
