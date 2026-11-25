# Token Radar v4 — token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ryukaa853/token-radar-01-v4/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ryukaa853/token-radar-01-v4/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads the sealed DefiLlama protocol snapshot, ranks
every rankable pre-token protocol by a fitted implied token value, and hands in
a dashboard a reader can use — board, detail view per protocol with its farm
plan, filter, and the live-token set shown at the market's own value.

## Model (radar-4)

`implied = TVL x multiple x growth x maturity`

- **multiple**: the median market-cap / TVL of the protocols in the same
  category whose token already trades (at least 3 comparables). A category
  with fewer falls back to the whole-universe median; a universe with none
  falls back to 0.25. The multiple is clamped to 0.02–5, so no outlier can
  push a row past the gate's cap. No category is ever left without a multiple.
- **growth**: 1 + the 7-day TVL change (clamped to −60%…+150%) x 0.5.
- **maturity**: 0.6 + up to 0.4 for up to three years tracked with no token
  (unknown listing date counts as one year).
- The board holds every watchlist slug first, then every other rankable
  pre-token protocol: not an exchange, not a versioned pool, and not a
  wrapped, staked or bridged product of a token that already trades (WBTC,
  Binance staked ETH and the like are not launches waiting to happen).
  Token-bearing protocols are shown apart, at the market's own value.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes
`board.json`, `data.js`, copies `dashboard/` and `screenshots/`, and writes
`dossier.json` with the vendored make.fun library. Before writing it checks
the board against the gate; after copying it checks the dashboard files, the
screenshots (sizes and dimensions) and the dossier byte for byte, and refuses
to exit 0 on any failure.

## Layout

- `main.ts` — entrypoint, I/O and the full 7-row gate self-check
- `lib/model.ts` — snapshot parsing, fitted model, board, farm plans
- `vendor/makefun-board.ts` — make.fun's dossier library, as the kit ships it
- `dashboard/` — the page: `index.html`, `app.css`, `app.js` (no network)
- `screenshots/` — the board, a protocol detail view, a filtered view

---

Entered on [make.fun](https://make.fun/?ref=8tc4hwe6&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
