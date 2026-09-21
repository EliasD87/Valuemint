-- Make the index keep itself up to date.
--
-- Run this ONCE, in the Supabase SQL editor, AFTER the site is deployed and
-- SUPABASE_URL / SUPABASE_SERVICE_KEY / INDEX_SYNC_SECRET are set on Vercel.
-- Before that there is nothing at the other end to call.
--
-- Replace the two placeholders below. Nothing else needs changing.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
--
-- Every 30 seconds Postgres calls the site's own sync route, which reads
-- whatever Seaport has announced since last time and writes it here. That is
-- the whole of the automation: no worker, no queue, nothing on anybody's
-- laptop.
--
-- It lives here rather than on Vercel's scheduler on purpose. Vercel's cron is
-- limited by plan tier and is another place for a setting to drift out of sync
-- with the code; pg_cron sits next to the data it maintains and costs nothing.
--
-- Nothing waits on this job. Every page that reads the index also knows how to
-- read the chain, so a run that fails, times out, or never happens costs speed
-- and nothing else — which is why it is safe to schedule and not watch.

create extension if not exists pg_cron;
create extension if not exists pg_net;

/**
 * The secret travels in the request header.
 *
 * It is stored in the job definition, so anyone who can read this database's
 * cron tables can read it. That is an acceptable trade for a key whose only
 * power is "may advance a cache of public chain state" — it cannot read a
 * table, spend anything, or touch an order. Supabase Vault is the tidier
 * home for it if you would rather; this stays plain so there is one step to
 * get wrong instead of four.
 */
select cron.schedule(
  'valuemint-index',
  '30 seconds',
  $job$
    select net.http_post(
      url := 'https://www.valuemint.store/api/index/sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-index-secret', 'PASTE_YOUR_INDEX_SYNC_SECRET_HERE'
      ),
      /**
       * Shorter than the route's own budget on purpose. The route loops until
       * it has caught up or 45 seconds have passed, and a cold start has
       * ~200,000 blocks to cover — but a request cut off early costs nothing,
       * because the watermark only moves after a pass has fully written. The
       * next tick simply picks up where this one stopped, so a backfill
       * finishes over several runs without anyone doing anything.
       */
      timeout_milliseconds := 30000
    );
  $job$
);

-- ---------------------------------------------------------------------------
-- Checking on it
-- ---------------------------------------------------------------------------

-- Is it scheduled?
--   select jobid, jobname, schedule, active from cron.job;

-- Did the last few runs work? `status` should read 'succeeded'.
--   select status, return_message, start_time
--   from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'valuemint-index')
--   order by start_time desc
--   limit 5;

-- Is the index actually moving? `last_block` should climb every half minute.
--   select name, last_block, updated_at from index_cursor;

-- ---------------------------------------------------------------------------
-- Turning it off
-- ---------------------------------------------------------------------------
--
-- Safe at any moment. The site notices the index has stopped within three
-- minutes and reads the chain instead, exactly as it did before any of this
-- existed.
--
--   select cron.unschedule('valuemint-index');

-- ---------------------------------------------------------------------------
-- If '30 seconds' is refused
-- ---------------------------------------------------------------------------
--
-- Sub-minute schedules need pg_cron 1.5 or newer. On an older one, use plain
-- cron syntax for once a minute instead — the only cost is that a new listing
-- takes up to a minute to appear rather than half of one:
--
--   select cron.schedule('valuemint-index', '* * * * *', $job$ ... $job$);
