# SHADOW MARKET

A dark trading empire browser game. **Now playable on GitHub Pages without any backend.**

## Play online

After GitHub Pages is enabled, the game will be available here:

**https://skibidifusion200810-star.github.io/game-lol-/**

The GitHub Actions workflow automatically publishes a Vite build whenever the main branch changes.

If the site gives 404, go to **Repository → Settings → Pages → Build and deployment → Source: GitHub Actions**. Then go to **Actions → Publish SHADOW MARKET to GitHub Pages → Run workflow**. The workflow also attempts to enable Pages automatically. Availability may depend on repository settings.

## Browser-only game on GitHub Pages

No backend, API keys or paid hosting are needed for the Pages edition:

- Create and log in to **browser-local accounts** with username and password (no email); each starts with $1,000 fictional dollars.
- Seven goods with simulated prices updating every 15 seconds.
- Buy/sell trades, inventory, wallet, portfolio value, profit/loss and warehouse upgrades.
- Five-minute auctions between demo accounts **created on the same browser**; bidding uses escrow and automatically settles when visited.
- Local leaderboard, local chat history and random market events.
- Price history charts and responsive dark gaming UI.
- Game progress, transactions and accounts saved in the browser.

**IMPORTANT: This is not online multiplayer.** Accounts, auctions, inventories, chat, and rankings do not sync between real players or devices. Closing the tab preserves progress in the same browser, but clearing site data or private browsing may erase it. Browser-only accounts are not secure online identities, so do not reuse real passwords. No real money is involved.

## Local preview of the GitHub Pages edition

Requires Node.js 20+.

1. Run npm install.
2. Set VITE_OFFLINE_MODE=true and VITE_BASE_PATH=/game-lol-/ in your environment.
3. Run npm run build.
4. Run npm run preview -w client.
5. Open the local URL shown in the terminal (include /game-lol-/).

On Windows PowerShell:

    npm install
    $env:VITE_OFFLINE_MODE='true'
    $env:VITE_BASE_PATH='/game-lol-/'
    npm run build
    npm run preview -w client

Browser game integration tests:

    node --test client/src/offline.test.mjs

## Original multiplayer server is still included

The Node.js/SQLite/WebSocket multiplayer backend is still available in server/. For true global multiplayer, accounts and inventory shared across devices, you need to deploy it to a persistent Node host separately. GitHub Pages cannot run Node.js, SQLite or WebSockets.

For local development using the real backend:

1. Copy .env.example to .env and set JWT_SECRET.
2. Run npm install, then npm run dev.
3. Visit http://localhost:3000.

For a Pages frontend connecting to a deployed backend, build with these environment variables:

- VITE_OFFLINE_MODE=false
- VITE_API_URL=https://your-secure-backend-domain
- VITE_BASE_PATH=/game-lol-/

Configure CLIENT_ORIGIN on the backend, use HTTPS/WSS and persist the database. Never expose backend secrets as VITE_ environment variables.

The **automatic Pages workflow uses VITE_OFFLINE_MODE=true** so the site works without any backend.

Advanced alliances and intercepted cargo shipments are future features, not yet built.
