import { afterEach, describe, expect, it } from "vitest";
import { injectedIsRefused, isRefusedConnector, isRefusedNamed } from "./refusedWallets";

const g = globalThis as { window?: { ethereum?: unknown } };

describe("refused wallets", () => {
  afterEach(() => {
    delete g.window;
  });

  it("refuses Phantom by its EIP-6963 id or its name", () => {
    expect(isRefusedNamed({ id: "app.phantom", name: "Phantom" })).toBe(true);
    expect(isRefusedNamed({ id: "something.else", name: "Phantom Wallet" })).toBe(true);
  });

  it("keeps every other wallet", () => {
    expect(isRefusedNamed({ id: "io.metamask", name: "MetaMask" })).toBe(false);
    expect(isRefusedNamed({ id: "com.okex.wallet", name: "OKX Wallet" })).toBe(false);
    expect(isRefusedConnector({ id: "walletConnect", name: "WalletConnect" })).toBe(false);
  });

  it("refuses the generic connector only while Phantom holds window.ethereum", () => {
    const generic = { id: "injected", name: "Injected" };
    expect(isRefusedConnector(generic)).toBe(false);

    g.window = { ethereum: { isPhantom: true } };
    expect(injectedIsRefused()).toBe(true);
    expect(isRefusedConnector(generic)).toBe(true);

    g.window = { ethereum: { isMetaMask: true } };
    expect(isRefusedConnector(generic)).toBe(false);
  });
});
