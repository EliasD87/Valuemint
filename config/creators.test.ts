import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/features", () => ({ CREATE_ENABLED: false }));
vi.mock("@/config/creators", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/config/creators")>();
  const CREATORS = ["0x1111111111111111111111111111111111111111"];
  return {
    ...real,
    CREATORS,
    canCreate: (a: string | undefined | null) => (a ? CREATORS.includes(a.toLowerCase()) : false),
  };
});

describe("approved creators", () => {
  it("lets only listed wallets create while creation is closed", async () => {
    const real = await vi.importActual<typeof import("@/config/creators")>("@/config/creators");
    // The shipped list: every entry a lower-case address, so the comparison in canCreate works.
    for (const a of real.CREATORS) expect(a).toMatch(/^0x[0-9a-f]{40}$/);
    // Closed, with nobody listed: nobody may create, connected or not.
    expect(real.canCreate(undefined)).toBe(false);
    expect(real.canCreate(null)).toBe(false);
    if (real.CREATORS.length === 0) expect(real.canCreate("0x2222222222222222222222222222222222222222")).toBe(false);
    // A listed wallet passes whatever its letter case; anyone else does not.
    for (const a of real.CREATORS) expect(real.canCreate(a.toUpperCase().replace("0X", "0x"))).toBe(true);
  });
});
