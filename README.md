# SHADOW MARKET

A responsive multiplayer trading game built from the concept and incomplete code supplied by Claude. The missing UI, backend endpoints, data persistence, secure login, and live exchange have been finished.

## What works

- Create account (username and password, no email) with $1,000 starting balance
- Persistent SQLite users, balances, inventories and transaction histories
- Seven tradeable goods: graphics cards, luxury watches, rare collectibles, mysterious cargo, gold bars, smartphones, vintage art
- Global server-simulated prices that fluctuate every 15 seconds and broadcast to everyone online
- Atomic buy/sell transactions, dynamic prices, live historical charts, profit/loss and portfolio totals
- Warehouse storage capacity and upgrades
- Live player-to-player auctions with escrow, bidding and 5-minute settlement
- Shared public chat, live market events and global net-worth leaderboard
- A complete responsive, dark React interface

Prices and balances are fictional in-game dollars. This is not a real-money trading service.

## Run locally

Requires Node.js 20 or newer.

1. Clone this repository.
2. Copy .env.example to .env.
3. Replace JWT_SECRET in .env with a long random string.
4. Run npm install in the repository root.
5. Run npm run dev.
6. Open http://localhost:3000 and register.

The server runs at http://localhost:5000. The database is created in server/data/ (ignored by Git).

Run npm run build to create the production frontend. Run npm start to start the backend; if client/dist exists the backend also serves the frontend on the same host/port. Run npm test for backend validation tests.

## Deploy online

Deploy as a single Node.js service:
- Build: npm install && npm run build
- Start: npm start
- Set NODE_ENV=production and JWT_SECRET to a secret string of at least 32 characters.
- Put DATABASE_PATH on a persistent disk so players do not lose their accounts after redeployments.
- Serve over HTTPS; WebSockets automatically use WSS on HTTPS pages.
- Optionally set CLIENT_ORIGIN to the exact allowed origin when hosting the frontend separately.

**GitHub Pages only hosts static content.** It cannot host the multiplayer backend, WebSockets, or database. If you use GitHub Pages, host the Node.js API separately, build the client with VITE_API_URL pointing to your backend URL and VITE_BASE_PATH set to /game-lol-/, then publish the client/dist folder. Without a public backend, registration and multiplayer will not function.

This starter runs as a single Node process with SQLite. For massive multiplayer scale, move storage to PostgreSQL and broadcast events using a shared message broker.

## API

POST /api/auth/register and /api/auth/login
GET /api/auth/me
GET /api/market/prices and /api/market/history/:id
POST /api/market/trade with itemId, side and quantity
GET /api/player/overview
POST /api/player/upgrade
GET /api/leaderboard, /api/events, /api/auctions, /api/chat
POST /api/auctions with itemId, quantity, startingBid
POST /api/auctions/:id/bid with amount
WebSocket /ws — send type auth with token, then type chat with message

## Next steps

Advanced ideas such as alliances, risk-based shipments and prestige resets are not implemented yet. This repository focuses on a complete, usable core game first.
