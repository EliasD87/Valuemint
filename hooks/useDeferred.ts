"use client";

import { useEffect, useState } from "react";

/**
 * True a moment after mount, for work that must not race the first paint.
 *
 * There is one RPC connection and everything on a page shares it. Measured on
 * a cold collection page, the order-book and activity log scans took it for
 * 1.4 seconds *between* the two reads that artwork depends on:
 *
 *     totalSupply landed          2,485 ms
 *     [ eth_blockNumber, eth_getLogs x2, x2, x6, x6, getOrderStatus x45 ]
 *     tokenByIndex x60 issued     3,902 ms
 *
 * The control case settles it: on a navigation where those scans were already
 * cached, `tokenByIndex` went out 26 ms after supply rather than 1,417 ms, and
 * the first image appeared at 2,177 ms instead of 4,669 ms.
 *
 * So the scans are not too slow, they are merely too early. What they feed —
 * a history panel below the fold — is not what anyone is waiting for, and a
 * page whose pictures arrive two seconds sooner is worth a feed that arrives
 * half a second later.
 *
 * Deliberately a timer rather than `requestIdleCallback`: the browser is
 * *already* idle while it waits on the network, so idle fires immediately and
 * changes nothing. What is wanted is "after the reads ahead of you have been
 * issued", and time is the honest approximation of that.
 */
export function useDeferred(ms: number): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);

  return ready;
}
