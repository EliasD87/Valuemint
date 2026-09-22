-- Why has the index stopped?
--
-- Run these in the Supabase SQL editor, top to bottom, and read the answers.
-- Nothing here writes anything and nothing here prints a secret.
--
-- NOTE ON SECRETS: `cron.job.command` contains the INDEX_SYNC_SECRET, because
-- the job definition carries it in the request header. Never `select *` from
-- that table and never paste its output anywhere. Every query below selects
-- columns explicitly for exactly that reason.
--
-- ---------------------------------------------------------------------------
-- The failure being diagnosed
-- ---------------------------------------------------------------------------
--
-- The site's sync route is alive and healthy — an unauthenticated POST to it
-- returns 401 in under half a second, so Vercel is serving and the handler
-- runs. The database is readable; the app reads orders from it fine. What has
-- stopped is the thing in between: something is no longer calling the route.
--
-- One successful run covers 200,000 blocks (MAX_BLOCKS_PER_RUN). The index is
-- only ~8,000 behind. So this is not a backlog that needs to catch up — no run
-- is completing at all, and a single good one would close the whole gap.
--
-- There are three candidates and they need different fixes:
--
--   A. pg_cron is not firing        -> Q1 and Q2 show it
--   B. pg_cron fires, pg_net never  -> Q2 says 'succeeded', Q3 shows nothing new
--      makes the request               (this is the common Supabase failure)
--   C. The request is made and       -> Q3 shows status_code 401
--      rejected                         (the secret drifted from Vercel's)

-- ---------------------------------------------------------------------------
-- Q1. Is the job still scheduled and active?
-- ---------------------------------------------------------------------------
--
-- `active` false, or no row at all, is cause A and the fix is to re-run
-- supabase/schedule.sql. Note the deliberate absence of `command`.
select
  jobid,
  jobname,
  schedule,
  active,
  username,
  database
from cron.job
where jobname = 'valuemint-index';

-- ---------------------------------------------------------------------------
-- Q2. Are its runs completing, and when was the last one?
-- ---------------------------------------------------------------------------
--
-- `status` should be 'succeeded' every 30 seconds.
--
-- Read `start_time` first, not `status`. If the newest row is hours old, the
-- scheduler stopped (cause A) whatever the statuses say. If the newest row is
-- seconds old and says 'succeeded', pg_cron is doing its job and the problem is
-- downstream of it — go to Q3.
--
-- 'succeeded' here means only that the SQL ran. `net.http_post` returns a
-- request id immediately and queues the actual call, so a job can succeed
-- forever while not one request ever leaves the database. That is exactly why
-- this query is not enough on its own.
select
  status,
  start_time,
  end_time,
  left(coalesce(return_message, ''), 200) as message
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'valuemint-index')
order by start_time desc
limit 10;

-- ---------------------------------------------------------------------------
-- Q3. Did the HTTP requests actually go out, and what came back?
-- ---------------------------------------------------------------------------
--
-- This is the query that settles it. pg_net records every response here.
--
--   * Rows arriving, status_code 200  -> the sync IS being called and is
--                                        working; the problem is elsewhere.
--   * Rows arriving, status_code 401  -> cause C. The secret in the cron job
--                                        no longer matches INDEX_SYNC_SECRET on
--                                        Vercel. Re-run schedule.sql with the
--                                        current value. (Unschedule first, see
--                                        the bottom of this file.)
--   * Rows arriving, status_code 5xx
--     or an error_msg               -> the route is failing; read the message.
--   * NO new rows at all             -> cause B. pg_net has stalled. Fix below.
--
-- `net._http_response` is pruned by Supabase, so an empty result can also mean
-- "nothing recent". Compare the newest timestamp against now().
select
  id,
  status_code,
  created,
  left(coalesce(error_msg, ''), 200) as error_msg
from net._http_response
order by created desc
limit 10;

-- ---------------------------------------------------------------------------
-- Q4. Is pg_net's outbound queue backed up?
-- ---------------------------------------------------------------------------
--
-- The classic Supabase failure: the pg_net background worker dies, requests
-- pile up in the queue and are never sent, and every cron run still reports
-- success. A count in the thousands that does not fall is the signature.
--
-- This table does not exist on every pg_net version. An error here is not a
-- finding — skip to Q5.
select count(*) as queued from net.http_request_queue;

-- ---------------------------------------------------------------------------
-- Q5. How far behind is the index, from the database's own point of view?
-- ---------------------------------------------------------------------------
--
-- `age` climbing past a minute or two means nothing is writing.
select
  name,
  last_block,
  updated_at,
  now() - updated_at as age
from index_cursor;

-- ---------------------------------------------------------------------------
-- FIX for cause B — pg_net stalled
-- ---------------------------------------------------------------------------
--
-- Restarting the worker is what clears it. Run this, wait a minute, then
-- re-run Q3 and Q5.
--
--   select net.worker_restart();
--
-- If the queue in Q4 was large, clear it first — those requests are hours old
-- and calling the sync route 5,000 times would achieve nothing except rate
-- limiting. This is safe: the queue holds nothing but repeat calls to a route
-- that is idempotent.
--
--   delete from net.http_request_queue;
--   select net.worker_restart();

-- ---------------------------------------------------------------------------
-- FIX for cause A or C — reschedule the job
-- ---------------------------------------------------------------------------
--
-- Always unschedule before rescheduling; cron.schedule on an existing name
-- replaces it, but doing it explicitly means a half-applied edit cannot leave
-- two jobs racing.
--
--   select cron.unschedule('valuemint-index');
--
-- Then run supabase/schedule.sql again with the CURRENT value of
-- INDEX_SYNC_SECRET from the Vercel dashboard.

-- ---------------------------------------------------------------------------
-- Catching up by hand, any time
-- ---------------------------------------------------------------------------
--
-- Independent of the cron entirely, and the fastest way to confirm the route
-- works end to end. Paste your secret in place of the placeholder, run it, wait
-- ten seconds, then check Q3 and Q5.
--
--   select net.http_post(
--     url := 'https://www.valuemint.store/api/index/sync',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-index-secret', 'PASTE_YOUR_INDEX_SYNC_SECRET_HERE'
--     ),
--     timeout_milliseconds := 30000
--   );
--
-- One run covers 200,000 blocks, so a single call closes a gap of this size.
