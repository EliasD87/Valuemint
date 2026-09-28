"use client";

import { useEffect, useState } from "react";
import { decodeFunctionResult, encodeFunctionData, formatEther, parseAbi } from "viem";
import { KOL_REWARDS_ADDRESS } from "@/config/kolRewards";
import "./LocalTestWallet.css";

/**
 * A wallet for rehearsing the KOL claim against a local Hardhat node. DEV ONLY.
 *
 * It announces itself over EIP-6963 like any extension, so it appears in the
 * ordinary wallet picker and the page goes through its real connect and write
 * paths. Behind it, every request goes straight to the node, whose accounts
 * are unlocked — so it signs as any of them without a key in sight.
 *
 * Mounted only when NEXT_PUBLIC_LOCAL_TEST_WALLET=1 (the `web-kols-local`
 * launch config), and it refuses to do anything unless the page is served
 * from loopback and talks to a loopback RPC. A production build never sets
 * the flag, so the import is dropped from the bundle entirely.
 *
 * The panel pairs with contracts/scripts/local-kol-rewards.mjs, which records
 * one scenario per node account; the labels below describe those.
 */

const RPC = (process.env.NEXT_PUBLIC_RPC_URLS ?? "").split(",")[0]?.trim() ?? "";
const CHAIN_HEX = `0x${(286623).toString(16)}`;
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;
const loopbackRpc = (() => {
  try {
    return LOOPBACK.test(new URL(RPC).hostname);
  } catch {
    return false;
  }
})();

/** What local-kol-rewards.mjs sets up for each account: account n owns portrait #n. */
const SCENARIOS: Record<number, string> = {
  1: "the ordinary claim",
  2: "claimed when opened",
  3: "a second ordinary claim",
  4: "portrait only",
  5: "a stranger can claim it",
  6: "not on the list",
};

const ABI = parseAbi([
  "function claim(uint256 id)",
  "function open(uint64 deadline)",
  "function statusOf(uint256 id) view returns (address wallet, bool isClaimed, uint256 amount)",
]);

/** Each account's portrait as the chain has it right now, not as the script left it. */
async function readStatus(accounts: string[]): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  for (let i = 1; i <= 6; i++) {
    const raw = (await node("eth_call", [
      { to: KOL_REWARDS_ADDRESS, data: encodeFunctionData({ abi: ABI, functionName: "statusOf", args: [BigInt(i)] }) },
      "latest",
    ])) as `0x${string}`;
    const [wallet, claimed, amount] = decodeFunctionResult({ abi: ABI, functionName: "statusOf", data: raw });
    out[i] =
      wallet.toLowerCase() !== accounts[i]?.toLowerCase()
        ? "not on the list"
        : `#${i} · ${amount > 0n ? `${formatEther(amount)} SOSO` : "portrait only"} · ${claimed ? "CLAIMED" : "unclaimed"}`;
  }
  return out;
}

type Listener = (...args: unknown[]) => void;

/** One provider for the page's lifetime, however often the panel renders. */
const wallet = {
  accounts: [] as string[],
  current: undefined as string | undefined,
  rejectNext: false,
  listeners: new Map<string, Set<Listener>>(),
};

let rpcId = 0;
async function node(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const body = (await res.json()) as { result?: unknown; error?: { code: number; message: string; data?: unknown } };
  if (body.error !== undefined) throw Object.assign(new Error(body.error.message), body.error);
  return body.result;
}

const emit = (event: string, ...args: unknown[]) => wallet.listeners.get(event)?.forEach((l) => l(...args));

const provider = {
  isLocalTestWallet: true,
  on(event: string, l: Listener) {
    if (!wallet.listeners.has(event)) wallet.listeners.set(event, new Set());
    wallet.listeners.get(event)!.add(l);
  },
  removeListener(event: string, l: Listener) {
    wallet.listeners.get(event)?.delete(l);
  },
  async request({ method, params = [] }: { method: string; params?: unknown[] }) {
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return wallet.current === undefined ? [] : [wallet.current];
      case "eth_chainId":
        return CHAIN_HEX;
      case "net_version":
        return "286623";
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain":
      case "wallet_watchAsset":
        return null;
      case "wallet_requestPermissions":
      case "wallet_getPermissions":
        return [{ parentCapability: "eth_accounts" }];
      case "wallet_revokePermissions":
        return null;
      case "eth_sendTransaction": {
        // A real wallet takes a moment to be answered; so does this one, so
        // the page's "confirm in your wallet" state can actually be seen.
        await new Promise((r) => setTimeout(r, 1200));
        if (wallet.rejectNext) {
          wallet.rejectNext = false;
          emit("_panel");
          throw Object.assign(new Error("User rejected the request."), { code: 4001 });
        }
        const tx = { ...(params[0] as Record<string, unknown>), from: wallet.current };
        return node("eth_sendTransaction", [tx]);
      }
      default:
        return node(method, params);
    }
  },
};

let announced = false;
function announce() {
  if (announced) return;
  announced = true;
  const detail = Object.freeze({
    info: {
      uuid: "7d6f0e2a-5c1b-4d4e-9a53-1c0de5a1e571",
      name: "Local test wallet",
      rdns: "dev.valuemint.localtest",
      icon:
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#ff5c00"/><text x="16" y="21" font-size="13" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#fff">TW</text></svg>',
        ),
    },
    provider,
  });
  const send = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
  window.addEventListener("eip6963:requestProvider", send);
  send();
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function LocalTestWallet() {
  const allowed =
    process.env.NODE_ENV === "development" &&
    typeof window !== "undefined" &&
    LOOPBACK.test(window.location.hostname) &&
    loopbackRpc;

  const [, bump] = useState(0);
  // Folded away on a phone, where it would cover the page it is testing.
  const [open, setOpen] = useState(() => typeof window === "undefined" || window.innerWidth > 700);
  const [slow, setSlow] = useState(false);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Record<number, string>>({});
  const refresh = () => bump((n) => n + 1);

  useEffect(() => {
    if (!allowed) return;
    wallet.listeners.set("_panel", new Set([refresh]));
    void (async () => {
      wallet.accounts = (await node("eth_accounts")) as string[];
      if (wallet.current === undefined) wallet.current = wallet.accounts[1];
      announce();
      refresh();
    })().catch((e: Error) => setNote(`Node unreachable at ${RPC}: ${e.message}`));
  }, [allowed]);

  // Re-read every few seconds, so a claim made anywhere shows up here.
  useEffect(() => {
    if (!allowed) return;
    const read = () => {
      if (wallet.accounts.length > 0) void readStatus(wallet.accounts).then(setStatus).catch(() => {});
    };
    read();
    const t = setInterval(read, 4000);
    return () => clearInterval(t);
  }, [allowed]);

  if (!allowed) return null;

  const pick = (i: number) => {
    wallet.current = wallet.accounts[i];
    emit("accountsChanged", [wallet.current]);
    refresh();
  };

  /** Run a node-side action and say what happened in the panel. */
  const act = async (label: string, fn: () => Promise<unknown>) => {
    setNote(`${label}…`);
    try {
      await fn();
      setNote(`${label}: done`);
    } catch (e) {
      setNote(`${label}: ${(e as Error).message.split("\n")[0]}`);
    }
  };

  const sendAs = (from: string, data: `0x${string}`) =>
    node("eth_sendTransaction", [{ from, to: KOL_REWARDS_ADDRESS, data }]);

  const current = wallet.accounts.indexOf(wallet.current ?? "");

  return (
    <aside className={`ltw${open ? "" : " is-closed"}`} aria-label="Local test wallet">
      <button type="button" className="ltw-head" onClick={() => setOpen((o) => !o)}>
        <span className="ltw-dot" aria-hidden="true" />
        Test wallet
        <span className="ltw-who">{current > 0 ? `account ${current}` : "—"}</span>
      </button>

      {open ? (
        <div className="ltw-body">
          <p className="ltw-label">Sign as</p>
          <div className="ltw-accounts">
            {[1, 2, 3, 4, 5, 6].map((i) =>
              wallet.accounts[i] === undefined ? null : (
                <button
                  key={i}
                  type="button"
                  className={`ltw-acct${i === current ? " is-on" : ""}`}
                  onClick={() => pick(i)}
                >
                  <b>{i}</b>
                  <span>{status[i] ?? SCENARIOS[i]}</span>
                  <i>{short(wallet.accounts[i]!)}</i>
                </button>
              ),
            )}
          </div>

          <p className="ltw-label">Happen next</p>
          <div className="ltw-actions">
            <label className="ltw-toggle">
              <input
                type="checkbox"
                checked={wallet.rejectNext}
                onChange={(e) => {
                  wallet.rejectNext = e.target.checked;
                  refresh();
                }}
              />
              Reject the next signature
            </label>
            <label className="ltw-toggle">
              <input
                type="checkbox"
                checked={slow}
                onChange={(e) => {
                  const on = e.target.checked;
                  setSlow(on);
                  void act(on ? "Slow chain (6s blocks)" : "Instant blocks", async () => {
                    await node("evm_setAutomine", [!on]);
                    await node("evm_setIntervalMining", [on ? 6000 : 0]);
                  });
                }}
              />
              Slow chain (6s blocks)
            </label>
          </div>

          <p className="ltw-label">On the chain</p>
          <div className="ltw-actions">
            <button
              type="button"
              onClick={() =>
                void act("Safe opens claiming", async () => {
                  const block = (await node("eth_getBlockByNumber", ["latest", false])) as { timestamp: string };
                  const deadline = BigInt(block.timestamp) + 30n * 86_400n;
                  await sendAs(wallet.accounts[0]!, encodeFunctionData({ abi: ABI, functionName: "open", args: [deadline] }));
                })
              }
            >
              Safe opens claiming
            </button>
            <button
              type="button"
              onClick={() =>
                void act("Stranger claims #5", () =>
                  sendAs(wallet.accounts[9]!, encodeFunctionData({ abi: ABI, functionName: "claim", args: [5n] })),
                )
              }
            >
              A stranger claims #5 for them
            </button>
            <button
              type="button"
              onClick={() =>
                void act("Chain moved past the deadline", async () => {
                  await node("evm_increaseTime", [31 * 86_400]);
                  await node("evm_mine");
                })
              }
            >
              Chain passes the deadline
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  Object.keys(localStorage)
                    .filter((k) => k.startsWith("kol-envelope-"))
                    .forEach((k) => localStorage.removeItem(k));
                } catch {}
                window.location.reload();
              }}
            >
              Show the envelope again (reload)
            </button>
          </div>

          {note === "" ? null : <p className="ltw-note">{note}</p>}
        </div>
      ) : null}
    </aside>
  );
}
