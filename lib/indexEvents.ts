import { decodeParams, type JsonEventArgs, type JsonOrderParameters } from "@/lib/indexRows";
import type { ActivityLog, ActivityStreams } from "@/lib/activityRows";

/**
 * Events from the index, rebuilt into the shape a scanned log has.
 *
 * Lifted out of `useIndexedActivity` (2026-10-09) so the server can read sales
 * the same way the page does: the Explore summary (lib/exploreSummary.ts)
 * counts volume from these, and two decoders would eventually disagree about
 * what a sale was. Pure, and safe on either side.
 *
 * Not a convenience: `buildActivityRows` hands these straight to `readOrder`
 * and `readFulfilment`, which compare and divide them. A string where a bigint
 * belongs does not throw there — `"10" > "9"` is false — it quietly produces
 * the wrong answer.
 */

/** A row of `events`, as the index stores it. */
export interface IndexedEvent {
  tx_hash: string;
  log_index: number;
  kind: "fulfilled" | "validated" | "cancelled";
  order_hash: string | null;
  block_number: number;
  args: JsonEventArgs;
  collection: string | null;
  token_id: string | null;
}

interface SpentIn {
  itemType: number;
  token: string;
  identifier: string;
  amount: string;
}

interface ReceivedIn extends SpentIn {
  recipient: string;
}

const spent = (i: SpentIn) => ({
  itemType: i.itemType,
  token: i.token as `0x${string}`,
  identifier: BigInt(i.identifier),
  amount: BigInt(i.amount),
});

export function decodeIndexedEvents(events: readonly IndexedEvent[]): ActivityStreams {
  const validated: ActivityLog[] = [];
  const fulfilled: ActivityLog[] = [];
  const cancelled: ActivityLog[] = [];

  for (const event of events) {
    const args = event.args as Record<string, unknown>;

    if (event.kind === "validated") {
      const params = args.orderParameters as JsonOrderParameters | undefined;
      if (params === undefined) continue;
      validated.push({
        args: { orderHash: args.orderHash, orderParameters: decodeParams(params) },
        blockNumber: BigInt(event.block_number),
        logIndex: event.log_index,
      });
      continue;
    }

    if (event.kind === "fulfilled") {
      fulfilled.push({
        args: {
          orderHash: args.orderHash,
          offerer: args.offerer,
          recipient: args.recipient,
          offer: ((args.offer as SpentIn[] | undefined) ?? []).map(spent),
          consideration: ((args.consideration as ReceivedIn[] | undefined) ?? []).map((i) => ({
            ...spent(i),
            recipient: i.recipient,
          })),
        },
        blockNumber: BigInt(event.block_number),
        logIndex: event.log_index,
      });
      continue;
    }

    cancelled.push({
      args: { orderHash: args.orderHash, offerer: args.offerer },
      blockNumber: BigInt(event.block_number),
      logIndex: event.log_index,
      /**
       * Resolved when the index wrote the row, so a narrowed query does not
       * lose its cancellations to a validation that fell outside the window.
       */
      collection: (event.collection ?? undefined) as `0x${string}` | undefined,
      tokenId: event.token_id === null ? undefined : BigInt(event.token_id),
    });
  }

  return { validated, fulfilled, cancelled };
}
