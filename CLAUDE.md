# ValueMint — project state

An NFT marketplace on ValueChain (SoSoValue's L1, chain **286623**), live at
**https://www.valuemint.store**.

Read this first. `README.md`, `web/ARCHITECTURE.md` and `contracts/README.md` go
deeper; this file is the map and the things that are expensive to rediscover.

---

## Where things are

| | |
|---|---|
| Live site | https://www.valuemint.store (Vercel, auto-deploys on push) |
| Repo | https://github.com/EliasD87/Valuemint — **`web/` only**, it is the repo root |
| Contracts, metadata pipeline | On disk only, not in any repo |
| Owner / deployer | `0xE2e4C5E48f514b06F907614B04d7A3F547Ee815A` (~0.2998 SOSO) |

```
web/          the Next.js app — the only thing in git
contracts/    Hardhat. Marketplace, collection, factory. Deploy + admin scripts
metadata/     art optimisation, metadata generation, IPFS pinning
trenches-wip/ a parked feature, see below
```

## On chain (mainnet 286623)

| What | Address |
|---|---|
| Marketplace | `0x0c0c1209C54fD220BcE31c81a9C044cE5e8928C5` — verified |
| Factory | `0x7DFcafE62ac616CEa70C6f98115280454cE2b54a` |
| Legacy factory | `0xb1153Aa3dbADD59e3e6aa61452f2DAa90b99A859` — still read |
| ValueChain Genesis | `0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B` — 51/100 |
| Trade Buddies | `0xe1C322BC972f78E78cfac98f71aA986C65D9C3bD` — 100/1000, 1 SOSO |
| Hypno Plush | `0x01c28095bfffc9973Da4c4e8A34E9d5b6649C988` — 10/100, 5 SOSO |
| The Trenches | `0xaAb0dC8f2835Ed903b35d2f52FF17c4bc92Bec19` — **claiming open**, free, 0/50000 |

`alpha` and `vv` were test collections. They still exist on chain — nothing can
delete a deployed contract — and are hidden from every listing via
`web/config/hidden.ts`.

## Storage

**Filebase** (S3 API, IPFS network) takes all new creator uploads. **Pinata** is
frozen at 440 files holding the three existing collections; nothing writes there
any more, and `PINATA_GATEWAY` is still required to serve them.

A collection costs **~11 objects regardless of supply** — 10 images plus one
manifest. Roughly 500–1,000 collections fit Filebase's free 5 GB at the ~5 MB
the real collections actually cost.

**Env on Vercel:** `FILEBASE_KEY`, `FILEBASE_SECRET`, `FILEBASE_BUCKET`,
`PINATA_GATEWAY`. Optional: `PIN_MIN_BALANCE_SOSO` (0.001), `SITE_URL`.
`PINATA_JWT` is no longer required. **Never prefix any with `NEXT_PUBLIC_`.**

For the Trenches claim: `TRENCHES_SIGNER_KEY` (secret — the contract mints
whatever it signs, so it is the whole collection; keep it off the deployer and
rotate with `setAuthoriser` if it leaks) plus the public
`NEXT_PUBLIC_TRENCHES_ADDRESS`. `NEXT_PUBLIC_TRENCHES_CHAIN_ID` defaults to
286623 and is only set to point a local build at a local chain.

---

## Rules that are easy to break

**This is a marketplace, not one collection's website.** Every page that
hardcoded a collection has been a bug, repeatedly. The home page reported one
collection's supply as the whole chain's for weeks. `useChainStats` for
marketplace-wide figures; `hooks/useCollection.ts` is single-address scoped and
says so at the top. `useTrade`'s `collection` parameter still defaults to
Genesis — a caller who forgets to pass one trades against the wrong contract
silently. Worth removing.

**Metadata is generated, not stored.** One pinned manifest per collection
describes the designs and shuffle seed; `/api/metadata` recomputes each token on
request. Storing one document per token made a collection cost files in
proportion to supply, and a 1000-piece collection simply failed.

**`baseURI` is immutable.** It is built from `SITE_URL`, never the request host —
a collection created from localhost would otherwise bake `localhost:5173` into a
permanent contract. Change `SITE_URL` *before* anyone creates a collection.

**Only tokens carry colour.** `styles/tokens.css` defines every colour in three
blocks (light, `prefers-color-scheme: dark`, `[data-theme="dark"]`). A literal
in a component stylesheet is right in one theme and wrong in the other.
`--paper` is the page; anything *on* the page uses `--surface`. A well nested
inside a card uses `--surface-2` — `--paper-2` equals `--surface` in dark.

**There is no monospace face.** `--mono` is a deliberate alias of `--sans`;
figures align with `tabular-nums`. Do not reintroduce a code face.

---

## Traps already paid for

**Transitions freeze when the browser pane is hidden — and the pane is always
hidden.** The cause is our own security header: `frame-ancestors 'none'` stops
the pane from framing the site, so it never composites. The console says so
outright (`Framing 'http://localhost:5173/' violates ... frame-ancestors`).
Consequences, all confirmed: screenshots do not render, `getComputedStyle`
returns a transition's *start* value forever — even against an inline
`!important` — and `setInterval` is intensively throttled, so a 4200ms rotation
ticks about every 28s. Before measuring anything animated, inject
`*{transition:none!important;animation:none!important}`; to prove an interval
advances, sample across a minute or use a `MutationObserver` stored on `window`
(the JS tool caps at 30s). Hours went into "debugging" CSS that was never
broken. **Design work here is verified by measuring geometry and contrast, not
by looking.**

**`100vw` includes the scrollbar.** A full-bleed element sized `width: 100vw`
inside a narrower content box overhangs by the scrollbar width and drags the
whole document into horizontal scroll. `#ladder` carries `overflow-x: clip` for
exactly this — `clip`, not `hidden`, so it does not become a scroll container
and sticky still works.

**A hero sized `min-height: 92vh` does not fit on screen.** It sits *below* a
72px header, so it overshoots by the header's height. Cap it:
`min(clamp(...), calc(100svh - var(--header-h) - 2px))`. The 2px is real — the
header renders 73px because of its bottom border.

**`tokenURI(1)` reverts when nothing is minted.** It is not a metadata check; a
fresh collection is indistinguishable from one with no artwork. Use the
contract's `baseURI()`. A deploy script crashed *after* succeeding on this.

**Pinata's limit is file count, not storage.** 440 files against ~19 MB of a
1 GB allowance. This is why metadata moved to manifests.

**Contract verification is blocked by a Cloudflare WAF bug** on the explorer —
the identifier `concat` in OpenZeppelin's `Bytes.sol` trips a SQL-injection rule,
so no standard NFT contract can be verified on ValueChain. Bisected and proven;
report written at `contracts/verification/BUG-REPORT-to-sodex.md`. Unfixable from
our side.

**`*.vercel.app` triggers wallet phishing warnings.** 3,705 known scam sites live
on that domain versus 621 across all of `.store`. The warning vanished the moment
the real domain was attached. Do not test wallet connection on a preview URL.

**The rate limiter is bypassable under concurrency — measured, not guessed.**
Sequential requests block correctly at #31; 40 parallel requests returned 19×200
*after the limit was already exhausted*, because each lambda has its own memory.
`lib/rateLimit.ts` is behind an interface for a Vercel KV swap.

---

## Security posture

Uploads to `/api/pin` require a **wallet signature over a SHA-256 digest of the
payload** (so a captured signature cannot be replayed against different files),
from an address holding a **minimum on-chain SOSO balance**, plus rate limits.
Verified in production: unsigned → 401, malformed → 400, SSRF probes → 404.

Security headers are set in `next.config.ts`. The site **was** framable — a real
clickjacking path for a wallet dApp — now `frame-ancestors 'none'` +
`X-Frame-Options: DENY`. The CSP deliberately omits `script-src`/`connect-src`;
Next inlines scripts and the app talks to wallets, RPC and IPFS, so that needs
its own pass with nonces.

No secrets in the client bundle (844 KB scanned against real key values), no
source maps, no exposed dotfiles.

---

## Open

1. **Rate limiter → Vercel KV.** One new class, one changed export.
2. **Contract verification** — blocked upstream; chase the SoDEX bug report.
3. **Trenches** — **launched 2026-08-29.** Contract
   `0xaAb0dC8f2835Ed903b35d2f52FF17c4bc92Bec19`, claiming **open**, app
   deployed. Free; the claimant pays gas only.
   - Authoriser `0x3f65a80Dfc4043c14eDc75bD0B96Cd5258FA3283`, key in
     `contracts/.trenches-signer.generated` (gitignored) and in Vercel as
     `TRENCHES_SIGNER_KEY`. **Not** the deployer: it signs only and holds
     nothing, so a leak costs one `setAuthoriser` call.
   - Proven in production: the live endpoint's signature recovers to exactly
     that authoriser for chain 286623 and the deployed address. Caller cannot
     name its own tier (sent `maxTier: 10`, got 7 back). No volume → 403.
   - `setClaimOpen(false)` pauses claiming at any time; already-minted tokens
     are permanent regardless.
   - Artwork CIDs live in `config/tiers.ts`, not on chain, so a piece can be
     re-imaged after minting — though marketplaces cache metadata for up to a
     week. Tier 1 was replaced before launch to remove Ripple Labs' XRP mark.
   - Tradeable on the marketplace with no special-casing (`list()` takes any
     ERC-721; royalties via ERC-2981). It is not a factory collection, so
     `config/known.ts` is what makes it appear on /collections and /market.


4. **CSP** — complete it with nonces.
5. **`useTrade` default parameter** — remove the Genesis fallback.

## Conventions

Everything touching wagmi is `"use client"`; only `/api/pin` and
`/api/metadata` run on the server. `TokenCard` requires a `collection` prop —
deliberately not optional, because making it required is what surfaced every
hardcoded call site at compile time. Metadata caches with `staleTime: Infinity`;
it is immutable content. Gateway fetches are bounded to ~8–10 concurrent.

Creators never see the words IPFS, CID or base URI. Those are plumbing.
