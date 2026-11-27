import { describe, expect, it } from "vitest";
import { recoverMessageAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { cleanText, creatorApplyMessage, normaliseLink } from "@/lib/creatorApply";

describe("creator applications", () => {
  it("accepts web links and refuses anything else", () => {
    expect(normaliseLink("https://x.com/me/status/1")).toBe("https://x.com/me/status/1");
    expect(normaliseLink("behance.net/someone")).toBe("https://behance.net/someone");
    expect(normaliseLink("")).toBeUndefined();
    expect(normaliseLink("javascript:alert(1)")).toBeUndefined();
    expect(normaliseLink("not a link")).toBeUndefined();
    expect(normaliseLink(`https://a.com/${"x".repeat(250)}`)).toBeUndefined();
    // Idempotent, so the server's second pass signs-checks the same text.
    const once = normaliseLink("foundation.app/@me")!;
    expect(normaliseLink(once)).toBe(once);
  });

  it("cleans text the same way on both ends", () => {
    expect(cleanText("  Night   Owls \n\n 100 pieces ")).toBe("Night Owls 100 pieces");
    expect(cleanText(cleanText(" a  b "))).toBe("a b");
  });

  it("a signature over the message recovers to the applying wallet", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const application = {
      wallet: account.address,
      handle: "someone",
      collection: "Night Owls",
      about: "100 owls, 5 SOSO each.",
      link: "",
      issuedAt: new Date().toISOString(),
    };
    const signature = await account.signMessage({ message: creatorApplyMessage(application) });
    expect(await recoverMessageAddress({ message: creatorApplyMessage(application), signature })).toBe(account.address);
    // Changing any field breaks it: the signature binds the whole application.
    const tampered = creatorApplyMessage({ ...application, collection: "Other" });
    expect(await recoverMessageAddress({ message: tampered, signature })).not.toBe(account.address);
  });
});
