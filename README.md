# MiniDyce

## Initia Hackathon Submission

**MiniDyce** is a fully on-chain casino built on Initia using the Move VM. Players wager MIN tokens on five probability-based games -- Coinflip, Lootbox, Range, Limbo, and Plinko -- where every bet, outcome, and payout is a transparent, verifiable blockchain transaction with no off-chain game logic.

### Custom Implementation

All game logic is implemented as Move smart contracts deployed on an Initia MiniMove rollup:

- **House module** (`contracts/sources/house.move`) -- Central vault management, bet validation, commit-reveal randomness scheme, and payout settlement. Players commit a sha256(secret) with their bet in one block, then reveal the secret in a later block. The outcome is derived from `sha256(secret || commit_block_height || commit_timestamp || player_address || nonce)`, ensuring neither the player nor the block producer can manipulate results.
- **5 game modules** -- Each game (coinflip, range, lootbox, limbo, plinko) has its own Move module with unique mechanics and multiplier calculations. Plinko simulates a full binomial distribution by iterating through rows on-chain.
- **Real-time indexer** (`indexer/index.js`) -- Node.js service that subscribes to Tendermint WebSocket events, parses Move transaction events to extract bet/payout data, stores in PostgreSQL, and broadcasts live updates to the frontend via WebSocket.
- **React frontend** -- Procedural sound effects via Web Audio API, animated game visuals, live transaction feed, and player leaderboard.

### Native Feature: Auto-Signing

MiniDyce integrates InterwovenKit's **auto-signing** feature to enable instant, popup-free gameplay. When enabled, a session key is created that allows the app to submit `MsgExecute` transactions without requiring wallet approval for each bet. This is critical for the casino UX -- players can place bets rapidly without interruption, making gameplay feel seamless and responsive. The toggle is accessible from the header and can be disabled at any time.

The **interwoven bridge** is also integrated, allowing players to transfer tokens from Initia L1 testnet directly into the rollup from within the app.

### How to Run Locally

1. **Start the Initia rollup** -- Use `weave rollup start -d` (requires weave CLI and minitiad installed).
2. **Deploy contracts** -- `cd contracts && move build` then publish via initiad CLI.
3. **Start the indexer** -- `cd indexer && npm install && npm start` (requires PostgreSQL with a `minidyce` database and `game_txs` / `player_stats` tables).
4. **Start the frontend** -- `cd frontend && npm install && npm run dev`, then open the local URL in your browser.
