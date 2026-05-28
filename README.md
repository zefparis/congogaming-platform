# Congo Gaming 🇨🇩

Mobile-first gaming web app for the DRC market. Vite + React + TS + Tailwind on the front, Fastify on the back, Supabase for storage, Unipesa for mobile money payments (Vodacom M-Pesa, Orange Money, Airtel Money, Africell Money).

## Stack

- **Frontend**: Vite + React 18 + TypeScript + Tailwind + framer-motion + lucide-react + react-router + GSAP
- **Backend**: Fastify 5 (TypeScript via `tsx`) + WebSocket (`@fastify/websocket`) + node-cron
- **DB / Auth storage**: Supabase (Postgres)
- **Payments**: Unipesa C2B / B2C
- **Deploy**: Vercel (frontend), any Node host (backend)

## Quickstart

```bash
cp .env.example .env
# Fill in Supabase and Unipesa creds
npm install
npm run dev:all       # starts Vite (5173) + Fastify (3001)
```

Open http://localhost:5173 on a phone-sized window (≤ 430px wide).

## Games & Features

### Games
- **Loto Congo**: 6/49 lottery with daily 20:00 Kinshasa draws. Jackpot grows until 5M CDF.
- **Loto Flash**: 5/20 quick lottery every 30 minutes. Pot accumulates until threshold.
- **Scratch**: Instant win scratch cards with reveal animations.
- **Okapi Climb**: Vertical climbing game with live feed, auto-bet, and real-time leaderboard.
- **PredictStreet**: Sports betting (FIFA World Cup 2026) via iframe integration. Requires KYC approval.

### Key Features
- **Wallet balance display**: Live balance shown in Flash and Loto screens, updates after each ticket.
- **Deposit/Withdraw quick access**: Buttons in HomeScreen header for instant navigation.
- **KYC integration**: Identity verification via PlayGuard for age verification and account gating.
- **Admin dashboard**: Desktop-oriented admin panel with Overview, Players, Games, and Transactions tabs.
- **Real-time features**: WebSocket feed for Okapi game live updates.
- **Automated draws**: Cron jobs for Loto, Flash, and Scratch draws.

## Supabase

1. Create a Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. Copy your project URL + `anon` key into `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
4. Copy the `service_role` key into `SUPABASE_SERVICE_KEY` (server only — never expose to client).

The schema creates:

- `users(id, phone, pin_hash, balance_cdf, kyc_status, blocked, created_at)` (phone unique)
- `transactions(id, user_id, order_id, type, amount, currency, provider_id, status, transaction_id, created_at)`
- `loto_tirages, loto_tickets, flash_tirages, flash_tickets, scratch_tickets, okapi_bets, okapi_sessions` (game-specific tables)
- `adjust_balance(user_id, delta)` RPC for atomic balance changes

PIN hashing uses SHA-256 of `congo_<pin>_gaming` on the client (4-digit PIN — keep brute-force concerns in mind; rate-limit at the API layer for production).

## Auth flow

- **Register**: phone (10 digits, RDC formats) + 4-digit PIN + 18+ checkbox → row in `users`.
- **Login**: phone + PIN → SHA-256 compared to `pin_hash`.
- Session stored as `localStorage["congo_session"] = { id, phone, balance_cdf, kyc_status, blocked }`.
- **KYC gating**: Only `/jouer` (PredictStreet) requires `kyc_status === 'approved'` or `'verify_age'`. Other games are accessible immediately after registration.
- **Account blocking**: Users with `blocked: true` or `kyc_status === 'denied'` are hard-blocked from all protected routes.

Operator detection from phone prefix:

| Prefix | Operator | provider_id |
|--------|----------|-------------|
| 084-089 | Orange Money | 10 |
| 097 / 099 | Airtel Money | 17 |
| 077 / 078 | Africell Money | 19 |

## Backend API

Base URL: `http://localhost:3001`

| Method | Path | Body / Params | Notes |
|--------|------|---------------|-------|
| GET  | `/health` | — | health check |
| POST | `/api/deposit` | `{ user_id, amount, provider_id, phone }` | calls Unipesa C2B |
| POST | `/api/withdraw` | `{ user_id, amount, provider_id, phone }` | calls Unipesa B2C, deducts immediately, refunds on failure |
| POST | `/api/callback` | Unipesa callback body | verifies HMAC-SHA512 signature, credits balance on `status === 2` |
| GET  | `/api/status/:order_id` | — | queries Unipesa, syncs DB |
| GET  | `/api/transactions/:user_id` | — | last 10 transactions |
| GET  | `/api/wallet/:user_id` | — | current balance |
| GET  | `/api/loto/latest` | — | latest draw + pot |
| POST | `/api/loto/ticket` | `{ user_id, numeros }` | submit Loto ticket |
| GET  | `/api/loto/mes-tickets/:user_id` | — | user's Loto tickets |
| GET  | `/api/flash/latest` | — | latest draw + pot |
| POST | `/api/flash/ticket` | `{ user_id, numeros }` | submit Flash ticket |
| GET  | `/api/flash/mes-tickets/:user_id` | — | user's Flash tickets |
| POST | `/api/scratch/buy` | `{ user_id, quantity }` | buy scratch cards |
| GET  | `/api/scratch/mes-tickets/:user_id` | — | user's scratch tickets |
| POST | `/api/okapi/bet` | `{ user_id, amount, auto }` | place Okapi bet |
| GET  | `/api/okapi/session/:id` | — | Okapi game session data |
| POST | `/api/kyc/submit` | `{ user_id, document_front, document_back, selfie }` | submit KYC documents |
| GET  | `/api/kyc/status/:user_id` | — | KYC status |
| GET  | `/api/admin/*` | — | admin dashboard data (Overview, Players, Games, Transactions) |

### Unipesa signature

HMAC-SHA512 of the concatenation of `key + value` for every field (lexically as inserted, except `signature` itself). Implementation in `server/lib/unipesa.ts`:

```ts
let s = '';
for (const [k, v] of Object.entries(data)) {
  if (k === 'signature') continue;
  if (typeof v === 'object') for (const [kk, vv] of Object.entries(v)) s += `${k}.${kk}${vv}`;
  else s += `${k}${v}`;
}
return createHmac('sha512', secret).update(s).digest('hex').toLowerCase();
```

`status` semantics used by the app:

| status | meaning |
|--------|---------|
| 0 | created (DB only) |
| 1 | pending at provider |
| 2 | success |
| 3 | failed |

## Deploy

### Frontend → Vercel

```bash
vercel
# Set env vars in Vercel dashboard:
#   VITE_SUPABASE_URL
#   VITE_SUPABASE_ANON_KEY
#   VITE_API_URL          (your Fastify public URL)
#   VITE_GAME_IFRAME_URL  (https://adipredictstreet.com or your game)
```

### Backend → any Node host (Render, Fly.io, Railway, VPS)

```bash
npm ci
npm run server:start
```

Required env vars (server-side only):

```
PORT, HOST,
UNIPESA_PUBLIC_ID, UNIPESA_MERCHANT_ID, UNIPESA_SECRET_KEY, UNIPESA_CALLBACK_URL,
SUPABASE_URL, SUPABASE_SERVICE_KEY,
PLAYGUARD_API_KEY, PLAYGUARD_VERIFICATION_ID
```

Set `UNIPESA_CALLBACK_URL` to `https://<your-api>/api/callback`.

## Project structure

```
congo-gaming/
├── src/
│   ├── components/  (BottomNav, GainsModal, InstallPrompt, NumPad, ProviderCard, TransactionItem)
│   ├── screens/     (Splash, Login, Register, Home, Game, Deposit, Withdraw, Account, Loto, Flash, Scratch, Legal, Kyc, Admin, okapi/)
│   ├── lib/         (supabase, auth, api)
│   ├── App.tsx      (router + page transitions + route guards)
│   └── main.tsx
├── server/
│   ├── index.ts     (Fastify bootstrap + CORS + WebSocket)
│   ├── cron.ts      (automated draws for Loto, Flash, Scratch)
│   ├── routes/      (admin, callback, deposit, flash, kyc, loto, okapi, okapi-auto, scratch, status, transactions, wallet, withdraw)
│   └── lib/         (unipesa signature + API, supabase admin)
├── supabase/schema.sql
├── .env.example
├── tailwind.config.js
└── vercel.json
```

## Notes / TODO

- The 4-digit PIN auth is intentionally simple for low-literacy users. Add **rate limiting** + **lockout** on the login endpoint for production.
- The phone-based "anon" Supabase RLS policies are permissive on purpose (so the unauthenticated app can register/login). You can move auth fully behind a server endpoint and lock RLS down to `service_role` only.
- The PredictStreet iframe URL is set via `VITE_GAME_IFRAME_URL` — change it to point at your game.
- Bebas Neue + Barlow Condensed (italic + weights) are loaded from Google Fonts in `index.html`.
- The container is capped at `max-w-app` (430px) — use a mobile viewport.
- PlayGuard integration handles age verification and account blocking. Configure `PLAYGUARD_API_KEY` and `PLAYGUARD_VERIFICATION_ID` in server env vars.
- Cron jobs run automatically for game draws. Ensure server timezone is set correctly (Africa/Kinshasa recommended).
