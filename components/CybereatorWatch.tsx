"use client";

import { useEffect, useRef } from "react";
import { usePublicClient } from "wagmi";
import { useQueryClient, type Query } from "@tanstack/react-query";
import { numberToHex, type Hex } from "viem";
import {
  CYBEREATOR,
  CYBEREATOR_DOC,
  CYBEREATOR_OPENER,
  CYBEREATOR_TOPICS,
  cybereatorDocPattern,
  cybereatorStatus,
} from "@/lib/cybereator";

/**
 * Keeps Cybereator pieces current through their reveal (from 10 November
 * 2026), the way the collection's team asked marketplaces to.
 *
 * Their contracts do not implement ERC-4906, so nothing tells a page a piece
 * changed. This listens instead, every 20 seconds, for the three events they
 * named, and refreshes exactly what each one changes:
 *
 *   - `Opened` / `Revealed` on the opener contract → that token's details;
 *   - `BaseURIUpdated` on the NFT contract → every token's metadata address
 *     and details (the move from SoDEX's gateway to cybereator.com).
 *
 * It also re-asks, every tick, for any piece this tab holds that is mid-reveal
 * (`Status` Opening or Rendering) until it finishes — usually under two
 * minutes — and, every ten minutes, for pieces still Unopened, the backstop
 * the team suggested for a missed event.
 *
 * Costs nothing on a page with no Cybereator in it: the chain is asked only
 * while this tab has some Cybereator's details loaded, and never while the
 * tab is hidden.
 */

const TICK_MS = 20_000;
const BACKSTOP_MS = 2 * 60_000;
/** A gap wider than this (a tab asleep for hours) is not scanned: everything is refreshed instead. */
const MAX_GAP = 20_000n;
/** Where a fresh tab starts looking: the last minute or so of blocks. */
const START_BACK = 30n;

function keyText(query: Query): string {
  return JSON.stringify(query.queryKey, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
}

interface RawLog {
  address: string;
  topics: Hex[];
}

export function CybereatorWatch() {
  const client = usePublicClient();
  const queryClient = useQueryClient();
  const lastBlock = useRef<bigint | undefined>(undefined);
  const lastBackstop = useRef(Date.now());

  useEffect(() => {
    if (client === undefined) return;
    const cache = queryClient.getQueryCache();

    const isDoc = (q: Query) => CYBEREATOR_DOC.test(keyText(q));
    const isTokenUri = (q: Query) => {
      const text = keyText(q).toLowerCase();
      return text.includes('"tokenuri"') && text.includes(CYBEREATOR);
    };

    const refreshToken = (id: bigint) => {
      const pattern = cybereatorDocPattern(id);
      void queryClient.invalidateQueries({ predicate: (q) => pattern.test(keyText(q)) });
    };
    const refreshEverything = () => {
      void queryClient.invalidateQueries({ predicate: (q) => isDoc(q) || isTokenUri(q) });
    };

    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      /* Nothing of Cybereator's on this tab: nothing to keep current. */
      if (cache.findAll({ predicate: (q) => isDoc(q) || isTokenUri(q) }).length === 0) {
        lastBlock.current = undefined;
        return;
      }

      try {
        const head = await client.getBlockNumber();
        const from = lastBlock.current === undefined ? head - START_BACK : lastBlock.current + 1n;
        if (from <= head) {
          if (head - from > MAX_GAP) {
            refreshEverything();
          } else {
            const logs = (await client.request({
              method: "eth_getLogs",
              params: [
                {
                  address: [CYBEREATOR_OPENER as Hex, CYBEREATOR as Hex],
                  fromBlock: numberToHex(from),
                  toBlock: numberToHex(head),
                  topics: [[CYBEREATOR_TOPICS.opened, CYBEREATOR_TOPICS.revealed, CYBEREATOR_TOPICS.baseUriUpdated]],
                },
              ],
            } as never)) as RawLog[];

            for (const log of logs) {
              const topic = log.topics[0]?.toLowerCase();
              const from = log.address.toLowerCase();
              if (topic === CYBEREATOR_TOPICS.baseUriUpdated && from === CYBEREATOR) {
                refreshEverything();
              } else if (
                from === CYBEREATOR_OPENER &&
                (topic === CYBEREATOR_TOPICS.opened || topic === CYBEREATOR_TOPICS.revealed) &&
                log.topics[1] !== undefined
              ) {
                /* One transaction can open up to 100 tokens: one log each. */
                refreshToken(BigInt(log.topics[1]));
              }
            }
          }
        }
        lastBlock.current = head;
      } catch {
        /* A missed tick is caught by the next one, or by the backstop below. */
      }

      const now = Date.now();
      const backstop = now - lastBackstop.current >= BACKSTOP_MS;
      if (backstop) lastBackstop.current = now;

      /*
        Pieces the chain says are opened but this tab still holds as sealed
        (2026-11-10, seen live: cards loaded before their reveal kept the
        sealed art). The Opened filter's list is the chain's own record, so a
        sealed copy of anything on it is stale and is asked for again now.
      */
      const opened = queryClient.getQueryData<string[]>(["cybereator-opened"]);
      const openedSet = opened === undefined ? undefined : new Set(opened);
      const idOf = (q: Query) => /\/(?:cybr|metadata)\/([0-9]+)/.exec(keyText(q))?.[1];

      void queryClient.invalidateQueries({
        predicate: (q) => {
          if (!isDoc(q)) return false;
          const status = cybereatorStatus(q.state.data);
          if (status === undefined) return false;
          if (status.toLowerCase() !== "unopened") return true;
          const id = idOf(q);
          return backstop || (id !== undefined && openedSet?.has(id) === true);
        },
      });
    };

    void tick();
    const timer = window.setInterval(() => void tick(), TICK_MS);
    return () => window.clearInterval(timer);
  }, [client, queryClient]);

  return null;
}
