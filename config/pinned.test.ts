import { describe, expect, it } from "vitest";
import { FEE_BPS, FEE_RECIPIENT, MAX_FULFILLER_OUTLAY_BPS } from "@/lib/seaport";
import { SEAPORT, CONDUIT_CONTROLLER } from "@/config/seaport";
import { deployment } from "@/config/contracts";

/**
 * The addresses and rates this build sends money to, pinned.
 *
 * These constants are not verifiable from inside the app at build time, and
 * three of them decide where funds go:
 *
 *   SEAPORT          every approval's operator, every buy's `value` destination
 *   deployment.wsoso what bidders deposit into, AND the whitelist unsafeReason
 *                    checks a bid's currency against — wrong in both directions
 *                    at once if wrong at all
 *   FEE_RECIPIENT    2.5% of every sale, written permanently into each order at
 *                    validate() time
 *
 * Nothing on chain disagrees with a wrong FEE_RECIPIENT, because Seaport has no
 * fee concept — the order simply names a different payee. And the one surface
 * that might have caught it, `useChainStats.protocolFeeBps`, reads the same
 * constant, so the UI would confirm the wrong value.
 *
 * `useVerifiedContracts` asks the chain about the first two at runtime. This
 * file is the other half: a hostile or careless change to any of them fails CI
 * rather than shipping. Changing one deliberately means changing it here too,
 * in a diff a reviewer will look at.
 */
describe("pinned addresses and rates", () => {
  it("Seaport is the canonical cross-chain address", () => {
    expect(SEAPORT).toBe("0x0000000000000068F116a894984e2DB1123eB395");
  });

  it("ConduitController is Seaport's own", () => {
    expect(CONDUIT_CONTROLLER).toBe("0x00000000F9490004C11Cef243f5400493c00Ad63");
  });

  it("WSOSO is the settlement token this marketplace accepts", () => {
    expect(deployment.wsoso).toBe("0x5050505050505050505050505050505050505050");
  });

  it("the factory has not moved", () => {
    expect(deployment.factory).toBe("0x7DFcafE62ac616CEa70C6f98115280454cE2b54a");
  });

  it("the chain is ValueChain mainnet", () => {
    expect(deployment.chainId).toBe(286623);
  });

  it("the protocol fee is 2.5% and goes where it is supposed to", () => {
    expect(FEE_BPS).toBe(250n);
    expect(FEE_RECIPIENT).toBe("0xE2e4C5E48f514b06F907614B04d7A3F547Ee815A");
  });

  it("the fulfiller outlay ceiling has not been widened", () => {
    // Raising this widens what a third-party order may charge someone accepting
    // a bid. It is the ceiling attack 1 was measured against.
    expect(MAX_FULFILLER_OUTLAY_BPS).toBe(1_000n);
  });
});
