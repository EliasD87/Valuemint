-- ValueMint index — schema
--
-- Everything here is a CACHE OF PUBLIC CHAIN STATE. Not one row is a source of
-- truth, and nothing in this database can cost anyone a token:
--
--   * Orders on ValueMint are validated ON CHAIN with an empty signature, so
--     the full parameters are already public in OrderValidated. There is no
--     private order data here to leak or lose.
--   * The site never sends a price from here to a wallet. It re-derives the
--     total from the parameters it is about to submit, and Seaport re-checks
--     that against its own storage.
--
-- So the worst a corrupted row can do is show a listing that is already gone.
-- The transaction then reverts and the visitor is out gas, not a token.
--
-- If this database is ever wrong, the fix is to REPLAY it, never to patch a
-- row by hand. Truncating these tables costs nothing but a re-read.

-- ---------------------------------------------------------------------------
-- How far the reader has got
-- ---------------------------------------------------------------------------

-- One row per log stream, holding the last block committed.
--
-- The watermark is only ever advanced to head - CONFIRMATIONS, matching
-- lib/logScan.ts. Two endpoints in a fallback transport can be a block apart,
-- so a watermark taken from the head can skip logs PERMANENTLY, because
-- nothing ever re-reads a committed range. Six blocks of lag is the price of
-- never doing that.
create table if not exists index_cursor (
  name        text primary key,
  last_block  bigint      not null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- The order book
-- ---------------------------------------------------------------------------

-- Every order the chain has announced, live or not.
--
-- Keyed by Seaport's own hash rather than by transaction, because validate()
-- is idempotent: the same order announced twice is one order. block_number
-- holds the LATEST validation, which is what makes the counter rule below mean
-- what it says. A maker who voids everything and then re-validates is live
-- again, and keeping the first block would have hidden that order forever.
create table if not exists orders (
  order_hash    text        primary key,
  offerer       text        not null,
  -- 'listing' offers an NFT for currency; 'offer' is the other direction.
  side          text        not null check (side in ('listing', 'offer')),
  collection    text        not null,
  -- Null for a criteria order, which names a set rather than one token.
  token_id      numeric(78, 0),
  -- Seaport's criteria field: 0 means any token in the collection, non-zero is
  -- a Merkle root. Carried raw, because a root is not self-describing.
  criteria      numeric(78, 0),
  -- The full consideration in wei. numeric(78,0) because a uint256 does not
  -- fit in any float, and every read of it casts to text for the same reason.
  price_wei     numeric(78, 0) not null,
  -- Zero address means native SOSO; anything else is an ERC-20 (WSOSO).
  currency      text        not null,
  start_time    bigint      not null,
  end_time      bigint      not null,
  -- The parameters exactly as the event carried them. Filling needs every
  -- field back, because Seaport addresses an order by a hash over all of them.
  params        jsonb       not null,
  block_number  bigint      not null,
  status        text        not null default 'open'
                check (status in ('open', 'filled', 'cancelled')),
  first_seen    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- What /market and every collection page ask for: open listings in a
-- collection, cheapest first.
create index if not exists orders_book
  on orders (collection, side, status, price_wei);

-- What /portfolio and /manage ask for: everything one address has standing.
create index if not exists orders_offerer
  on orders (offerer, status);

-- Who has voided everything they had standing, and from which block.
--
-- incrementCounter does not touch any individual order's status. It changes
-- the hash future fulfilments compute, so a standing order becomes unreachable
-- while still reporting itself validated. Re-deriving every hash would cost a
-- call per order; this costs one log stream for all of them.
create table if not exists counters (
  offerer             text   primary key,
  voided_after_block  bigint not null
);

-- ---------------------------------------------------------------------------
-- History
-- ---------------------------------------------------------------------------

-- Every Seaport event, as the chain emitted it.
--
-- Separate from `orders` because the two answer different questions. `orders`
-- is the live book and keeps one row per order, overwritten as it changes.
-- This is the log: it never changes, a row is never updated, and the same order
-- appears as many times as it was announced, sold or cancelled.
--
-- `args` holds the event's own arguments verbatim, with every uint256 as a
-- string. Deliberately raw rather than pre-digested into "a sale of token 7 for
-- 12 SOSO", because deciding what a fulfilment *means* is a security control,
-- not a formatting step: `readFulfilment` refuses settlement currencies it does
-- not recognise, and an ungated one lets a wash trade in a worthless token show
-- as "last sale 1,000,000" to everyone pricing the piece. That rule stays in
-- one place, on the client, where `readOrder` lives too.
create table if not exists events (
  -- A log is identified by where it happened, and cannot happen twice there.
  -- That is what makes re-reading a block range free.
  tx_hash       text   not null,
  log_index     int    not null,
  kind          text   not null check (kind in ('fulfilled', 'validated', 'cancelled')),
  -- Present on all three today; nullable so a future event without one fits.
  order_hash    text,
  block_number  bigint not null,
  args          jsonb  not null,
  primary key (tx_hash, log_index)
);

-- Columns to narrow by, alongside the raw args.
--
-- These are FILTER KEYS, not claims. What a row says — the price, who bought,
-- which piece — is still decided on the client by `readOrder` and
-- `readFulfilment` reading `args`, which is why those are stored raw. A wrong
-- value in one of these columns can put a row on the wrong page or hide it; it
-- cannot change what the row asserts, and the gate still drops a row whose
-- settlement currency this marketplace does not recognise.
--
-- They exist because the alternative measured badly. Without them the whole
-- history had to be sent to every visitor and narrowed in the browser: 221
-- events was 24.5 KB compressed and rising, and at the 2,000-row cap it would
-- have been about 220 KB — on every collection page, every token page, and
-- every card that wanted a last-sale figure.
alter table events add column if not exists collection text;
alter table events add column if not exists token_id   numeric(78, 0);
alter table events add column if not exists maker      text;
alter table events add column if not exists taker      text;

-- Newest first is the only order history is ever read in.
create index if not exists events_recent
  on events (block_number desc, log_index desc);

-- What a collection page and a token page ask for.
create index if not exists events_by_collection
  on events (collection, block_number desc, log_index desc);

-- What /portfolio asks for: everything one address was a party to, either side.
create index if not exists events_by_maker on events (maker, block_number desc);
create index if not exists events_by_taker on events (taker, block_number desc);

-- ---------------------------------------------------------------------------
-- What the app reads
-- ---------------------------------------------------------------------------

-- The three ways an order retires, applied in one place.
--
-- Numeric, for aggregation only. Nothing reads this directly: a uint256 sent
-- as a JSON number loses precision above 2^53, and 1 SOSO is 1e18 wei, so
-- every public view below casts to text instead.
create or replace view live_orders as
  select o.*
  from orders o
  left join counters c on c.offerer = o.offerer
  where o.status = 'open'
    and (o.end_time = 0 or o.end_time > extract(epoch from now()))
    and (c.voided_after_block is null or o.block_number >= c.voided_after_block);

-- Live listings, safe to serialise.
--
-- Two price columns, and the reason is a bug this schema already shipped once.
--
-- price_wei is text because a uint256 sent as a JSON number loses precision.
-- But text sorts LEXICOGRAPHICALLY, so "order by price_wei.asc" put
-- "10000000000000000000" (10 SOSO) ahead of "9000000000000000000" (9 SOSO) and
-- dropped the genuine floor out of the cheapest-first page altogether. It does
-- not look like a bug from outside: the rows are real, the order is confident,
-- and the cheapest one is simply missing.
--
-- price_sort is a float and exists for ORDER BY and nothing else. It is lossy
-- past the 17th digit, which cannot reorder two prices anyone would notice, and
-- it must never be displayed — the exact figure is price_wei.
create or replace view listings_public as
  select
    order_hash,
    offerer,
    collection,
    token_id::text   as token_id,
    criteria::text   as criteria,
    price_wei::text  as price_wei,
    currency,
    start_time,
    end_time,
    block_number,
    params,
    price_wei::double precision as price_sort
  from live_orders
  where side = 'listing';

-- Live bids, safe to serialise. Same two price columns, same reason.
create or replace view offers_public as
  select
    order_hash,
    offerer,
    collection,
    token_id::text   as token_id,
    criteria::text   as criteria,
    price_wei::text  as price_wei,
    currency,
    start_time,
    end_time,
    block_number,
    params,
    price_wei::double precision as price_sort
  from live_orders
  where side = 'offer';

-- Listed count and floor per collection.
--
-- The floor is the minimum over live listings only. An expired or voided order
-- quoting 0.1 SOSO would otherwise set a floor nobody can buy at.
create or replace view collection_floors as
  select
    collection,
    count(*)::int        as listed,
    min(price_wei)::text as floor_wei
  from live_orders
  where side = 'listing'
  group by collection;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- Nobody reaches this database from a browser.
--
-- Supabase grants select on everything in public to the anon and authenticated
-- roles by default, which would put the whole schema one anon key away from
-- the internet. The site does not want that: reads go through Next route
-- handlers holding the service key, so the edge can cache them and the schema
-- stays private.
--
-- RLS with no policies closes the tables. The revokes close the views, which
-- RLS does not cover: a view runs as its owner, so an ungranted view is the
-- only thing stopping it reading straight past the tables' RLS.
alter table index_cursor enable row level security;
alter table orders       enable row level security;
alter table counters     enable row level security;
alter table events       enable row level security;

revoke all on index_cursor, orders, counters, events from anon, authenticated;
revoke all on live_orders, listings_public, offers_public, collection_floors
  from anon, authenticated;

-- And for anything added later, so this cannot be forgotten once.
alter default privileges in schema public revoke all on tables from anon, authenticated;
