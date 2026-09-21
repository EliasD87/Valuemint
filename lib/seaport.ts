import { zeroAddress, zeroHash, type Address, type Hex } from "viem";
import { deployment } from "@/config/contracts";

/**
 * Building Seaport orders.
 *
 * Everything here is a pure function over plain values, deliberately: an order
 * is a data structure whose meaning depends entirely on getting a dozen fields
 * right, and the failure mode of getting one wrong is not an error message. An
 * order with the wrong `totalOriginalConsiderationItems` is rejected outright;
 * one with the wrong *recipient* settles perfectly and pays a stranger. So the
 * shapes are built in one place with tests around them, and no component
 * assembles an order by hand.
 *
 * The model, in short:
 *
 *   `offer`         what the person making the order gives up.
 *   `consideration` what must be paid out, and to whom, for it to settle.
 *
 * A listing offers the NFT and asks for currency. A bid offers currency and asks
 * for the NFT. That symmetry is the whole protocol, and it is why one contract
 * replaces the `list` / `buy` / `makeOffer` / `acceptOffer` quartet the previous
 * marketplace needed.
 */

export const ItemType = {
  NATIVE: 0,
  ERC20: 1,
  ERC721: 2,
  ERC1155: 3,
  ERC721_WITH_CRITERIA: 4,
  ERC1155_WITH_CRITERIA: 5,
} as const;

export const OrderType = {
  FULL_OPEN: 0,
  PARTIAL_OPEN: 1,
  FULL_RESTRICTED: 2,
  PARTIAL_RESTRICTED: 3,
} as const;

export interface OfferItem {
  itemType: number;
  token: Address;
  identifierOrCriteria: bigint;
  startAmount: bigint;
  endAmount: bigint;
}

export interface ConsiderationItem extends OfferItem {
  recipient: Address;
}

export interface OrderParameters {
  offerer: Address;
  zone: Address;
  offer: readonly OfferItem[];
  consideration: readonly ConsiderationItem[];
  orderType: number;
  startTime: bigint;
  endTime: bigint;
  zoneHash: Hex;
  salt: bigint;
  conduitKey: Hex;
  totalOriginalConsiderationItems: bigint;
}

/** What `cancel` and `getOrderHash` take: the same order, with the offerer's counter. */
export interface OrderComponents extends Omit<OrderParameters, "totalOriginalConsiderationItems"> {
  counter: bigint;
}

/**
 * The marketplace's cut, carried over unchanged from the contract it replaces
 * (`protocolFeeBps = 250`, recipient `0xE2e4...815A`, both read off chain).
 *
 * Seaport has no notion of a fee. It pays exactly the consideration items the
 * order names, so a fee is just another recipient written into the order by
 * whoever built it - which means it is visible to the person signing it, and set
 * to zero by changing this one number rather than by an owner transaction.
 */
export const FEE_BPS = 250n;
export const FEE_RECIPIENT: Address = "0xE2e4C5E48f514b06F907614B04d7A3F547Ee815A";
const BPS = 10_000n;

/**
 * Royalties are not enforced.
 *
 * Seaport pays the consideration and nothing else, so a creator's EIP-2981 share
 * is only paid if the order names it. `RoyaltyEnforcingZone` exists, is deployed
 * and is tested, but the decision on 2026-09-16 was to run plain Seaport - so
 * every order below is `FULL_OPEN` with no zone, and no royalty item is added.
 *
 * Turning it back on is two changes here, both in `buildListing` / `buildOffer`:
 * `zone: ROYALTY_ZONE` with `orderType: FULL_RESTRICTED`, plus a consideration
 * item for the creator. No redeployment, no migration of existing orders.
 */
export const ZONE: Address = zeroAddress;

/**
 * Approve Seaport itself rather than routing through a conduit.
 *
 * A conduit is an indirection that lets one approval serve several protocol
 * versions. With exactly one Seaport here and no plans for a second, it would be
 * a contract sitting in the path of every transfer, earning nothing.
 */
export const CONDUIT_KEY: Hex = zeroHash;

/** How long a new order stands, in days. */
export const DEFAULT_ORDER_DAYS = 90;

/**
 * A random salt, so two identical orders are still two distinct orders.
 *
 * It matters more than it looks. The order hash covers every field, and a
 * cancelled hash can never be revalidated - so without a salt, a seller who
 * listed at 1 SOSO, cancelled, then listed at 1 SOSO again would be recreating a
 * hash Seaport has permanently marked cancelled, and the second listing would
 * simply not work. 64 bits is far beyond collision range for one account.
 */
export function randomSalt(): bigint {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let salt = 0n;
  for (const b of bytes) salt = (salt << 8n) | BigInt(b);
  return salt;
}

export function expiryIn(days: number): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + Math.floor(days * 86_400));
}

/** The marketplace's cut of `total`, and what is left for the seller. */
export function splitFee(total: bigint): { fee: bigint; net: bigint } {
  const fee = (total * FEE_BPS) / BPS;
  return { fee, net: total - fee };
}

/**
 * The two halves of the same conversion, kept together so they cannot drift.
 *
 * Seaport prices the lot: an order says "these 10 editions for this much".
 * Everywhere a person sees a number, though, it is per unit — "0.5 SOSO each" —
 * because that is the only figure that compares two sellers of the same edition.
 *
 * Getting the direction wrong does not fail: it lists ten editions for the price
 * of one, and the first buyer takes the lot at a tenth of what the seller meant.
 * So both directions live here with a test that they round-trip.
 */
export function lotPrice(unitPriceWei: bigint, amount: bigint): bigint {
  return unitPriceWei * amount;
}

export function unitPrice(lotPriceWei: bigint, amount: bigint): bigint {
  return amount <= 0n ? lotPriceWei : lotPriceWei / amount;
}

interface ListingInput {
  seller: Address;
  collection: Address;
  tokenId: bigint;
  /** What the buyer pays in total, fee included. */
  priceWei: bigint;
  /** ERC-1155 only: how many units. Omit for ERC-721. */
  amount?: bigint;
  days?: number;
  salt?: bigint;
}

/**
 * Sell an NFT for native SOSO.
 *
 * The price quoted is the price the buyer pays - the fee comes out of the
 * seller's side, not added on top. Any other arrangement means the figure on the
 * card is not the figure the wallet asks for.
 */
export function buildListing(input: ListingInput): OrderParameters {
  const amount = input.amount ?? 1n;
  const isMulti = input.amount !== undefined;
  const { fee, net } = splitFee(input.priceWei);

  const consideration: ConsiderationItem[] = [
    payment(net, input.seller),
    ...(fee > 0n ? [payment(fee, FEE_RECIPIENT)] : []),
  ];

  return {
    offerer: input.seller,
    zone: ZONE,
    offer: [
      {
        itemType: isMulti ? ItemType.ERC1155 : ItemType.ERC721,
        token: input.collection,
        identifierOrCriteria: input.tokenId,
        startAmount: amount,
        endAmount: amount,
      },
    ],
    consideration,
    /**
     * ERC-1155 listings are partially fillable; ERC-721 ones cannot be. There is
     * only one of the token, so half an order is meaningless, and `PARTIAL_*`
     * would only widen what a fulfiller is allowed to do with it.
     */
    orderType: isMulti ? OrderType.PARTIAL_OPEN : OrderType.FULL_OPEN,
    ...timing(input.days, input.salt),
    totalOriginalConsiderationItems: BigInt(consideration.length),
  };
}

interface OfferInput {
  bidder: Address;
  collection: Address;
  /**
   * The exact token being bid on, or `undefined` for a collection-wide offer
   * that any holder can accept.
   */
  tokenId?: bigint;
  priceWei: bigint;
  days?: number;
  salt?: bigint;
}

/**
 * Bid on an NFT, in WSOSO.
 *
 * Wrapped rather than native because an offer has to stand over time without the
 * marketplace holding anyone's money: the bidder keeps the funds and grants an
 * allowance, and it moves only when a holder accepts. Native SOSO cannot be
 * pulled that way - an escrow contract would be the alternative, and that is a
 * pot of other people's money with all the risk that implies.
 *
 * Leave `tokenId` out for a collection offer. Seaport expresses that as a
 * criteria item whose `identifierOrCriteria` is zero, meaning any token in this
 * contract - no Merkle root, no list. That is the fix for the original
 * complaint: an offer on one Larper that the holder of another could not accept.
 */
export function buildOffer(input: OfferInput): OrderParameters {
  const wsoso = deployment.wsoso as Address;
  const { fee } = splitFee(input.priceWei);
  const anyToken = input.tokenId === undefined;

  const consideration: ConsiderationItem[] = [
    {
      itemType: anyToken ? ItemType.ERC721_WITH_CRITERIA : ItemType.ERC721,
      token: input.collection,
      identifierOrCriteria: input.tokenId ?? 0n,
      startAmount: 1n,
      endAmount: 1n,
      recipient: input.bidder,
    },
    /**
     * The fee is paid by whoever accepts, out of the proceeds. Seaport moves the
     * offered WSOSO to them first and pulls this second, so they never need a
     * WSOSO balance of their own - but they do need an allowance, which is why
     * the accept flow asks for one.
     */
    ...(fee > 0n
      ? [
          {
            itemType: ItemType.ERC20,
            token: wsoso,
            identifierOrCriteria: 0n,
            startAmount: fee,
            endAmount: fee,
            recipient: FEE_RECIPIENT,
          },
        ]
      : []),
  ];

  return {
    offerer: input.bidder,
    zone: ZONE,
    offer: [
      {
        itemType: ItemType.ERC20,
        token: wsoso,
        identifierOrCriteria: 0n,
        startAmount: input.priceWei,
        endAmount: input.priceWei,
      },
    ],
    consideration,
    orderType: OrderType.FULL_OPEN,
    ...timing(input.days, input.salt),
    totalOriginalConsiderationItems: BigInt(consideration.length),
  };
}

function payment(amount: bigint, to: Address): ConsiderationItem {
  return {
    itemType: ItemType.NATIVE,
    token: zeroAddress,
    identifierOrCriteria: 0n,
    startAmount: amount,
    endAmount: amount,
    recipient: to,
  };
}

/**
 * `startTime` is 0 rather than "now".
 *
 * An order put on chain with `validate()` is live from the block that lands it,
 * so a start time is at best redundant and at worst a bug: a browser clock a
 * minute fast produces an order Seaport refuses as not yet begun, with nothing
 * on screen to explain it. Interpolation between `startAmount` and `endAmount`
 * is the only thing that reads it, and every order here is a fixed price with
 * the two equal.
 *
 * Expiry is real, and deliberately finite. Orders that never expire are the
 * shape of the January 2022 OpenSea incident: a stale listing sits in storage,
 * every frontend hides it because the seller no longer holds the token, and it
 * settles the moment the token comes back. 90 days is long enough to forget
 * about and short enough to die on its own.
 */
function timing(days: number | undefined, salt: bigint | undefined) {
  return {
    startTime: 0n,
    endTime: expiryIn(days ?? DEFAULT_ORDER_DAYS),
    zoneHash: zeroHash as Hex,
    salt: salt ?? randomSalt(),
    conduitKey: CONDUIT_KEY,
  };
}

// --------------------------------------------------------------- reading back

export type OrderKind = "listing" | "offer";

export interface ReadOrder {
  kind: OrderKind;
  collection: Address;
  /** `undefined` on a collection-wide offer, which names no single token. */
  tokenId?: bigint;
  /** Who made the order: the seller on a listing, the bidder on an offer. */
  maker: Address;
  /** Native SOSO (the zero address) on a listing, WSOSO on an offer. */
  currency: Address;
  /** What the counterparty pays in total, fee included. */
  priceWei: bigint;
  /** ERC-1155 quantity; 1 for ERC-721. */
  amount: bigint;
  endTime: bigint;
}

/**
 * Work out what an order actually is, from its items alone.
 *
 * Seaport has no listing or offer type - the distinction is only which side the
 * NFT sits on. Deriving it here rather than trusting an event name means orders
 * built by anything else, including a script or a future frontend, are
 * understood too.
 *
 * Returns `undefined` for shapes this app does not price: a swap with no
 * currency, a listing denominated in some other token, a bundle. Those are valid
 * Seaport orders and showing them as though they were simple sales would be
 * worse than not showing them.
 */
/**
 * The most a fulfiller may be asked to pay on top of handing over the NFT,
 * as a share of what they receive.
 *
 * Our own offers put one ERC-20 line in the consideration — the 2.5% marketplace
 * fee, paid by whoever accepts, out of their proceeds. That is legitimate and
 * has to keep working. 10% leaves room for a third-party order with a slightly
 * different fee while making "pay me 500 WSOSO for my 0.5 WSOSO bid" impossible.
 */
export const MAX_FULFILLER_OUTLAY_BPS = 1_000n;

/**
 * What accepting this bid will actually cost the holder, beyond the NFT.
 *
 * Read from the order's own consideration rather than assumed from `FEE_BPS`.
 * The UI used to compute the acceptor's fee as `splitFee(priceWei).fee` — 2.5%,
 * our own rate — while `unsafeReason` admits any bid whose outlay is up to
 * MAX_FULFILLER_OUTLAY_BPS, i.e. 10%. A third-party bid carrying a larger fee
 * line was therefore displayed as costing 2.5% and budgeted an allowance for
 * 2.5%.
 *
 * For a holder with no standing bids that merely reverts. For a holder who has
 * bid before — and so carries a WSOSO allowance sized to cover their own bids —
 * it settles, and they receive up to 7.5% less than the figure they were shown.
 *
 * The order has said so all along; nothing was reading it.
 */
export function fulfillerOutlay(p: OrderParameters): bigint {
  let outlay = 0n;
  for (const i of p.consideration) {
    // Only ERC-20 lines cost the acceptor anything; the NFT line is what they
    // are handing over, and `unsafeReason` has already refused any bid whose
    // non-NFT lines are not all the one accepted currency.
    if (i.itemType !== ItemType.ERC20) continue;
    outlay += i.startAmount;
  }
  return outlay;
}

/** More than this many payees is not a shape this app can present honestly. */
const MAX_CONSIDERATION_ITEMS = 5;

/**
 * The only token a bid may be denominated in.
 *
 * Without this, every currency check in `unsafeReason` was relative: the
 * consideration had to match whatever the *offer* named, and nothing said what
 * the offer itself was allowed to be. An attacker deploys an ERC-20 whose
 * `balanceOf` and `allowance` return anything they like, bids 1,000,000 of it
 * for any piece in a collection, and the app renders that as "1,000,000 WSOSO"
 * because the unit is a literal in the markup. The holder accepts, hands over a
 * real NFT, and receives a token the attacker minted for nothing.
 *
 * It needed no fee line — which meant `outlay` stayed 0 and the
 * `MAX_FULFILLER_OUTLAY_BPS` ceiling was satisfied trivially — and no allowance
 * from the victim, because the only permission in play is the
 * `setApprovalForAll` they granted the first time they listed anything.
 *
 * Absolute, not relative. That is the whole fix.
 */
export const ACCEPTED_BID_CURRENCY: Address = deployment.wsoso as Address;

export type UnsafeReason =
  | "offer-must-be-one-item"
  | "offer-item-type-unsupported"
  | "listing-consideration-must-be-native"
  | "bid-currency-not-accepted"
  | "bid-must-name-exactly-one-nft"
  | "bid-nft-must-go-to-the-bidder"
  | "bid-consideration-must-be-one-currency"
  | "bid-quantity-unsupported"
  | "bid-criteria-unresolvable"
  | "order-names-a-zone"
  | "order-type-unsupported"
  | "order-never-expires"
  /**
   * Not returned by `unsafeReason`, and deliberately kept.
   *
   * The equivalent gate lives in `readFulfilment`, which returns `undefined`
   * rather than a reason because its caller wants a fulfilment or nothing. This
   * member documents that the currency rule exists on the history path too —
   * the gate the codebase records as having been missed once, after `readOrder`
   * was already protected.
   *
   * A reviewer reading only this union would otherwise conclude the history
   * path is ungated. Deleting it would be tidier and less honest.
   */
  | "settlement-currency-not-recognised"
  | "fulfiller-outlay-too-high"
  | "amount-varies-over-time"
  | "too-many-consideration-items";

/**
 * Why this order must not be shown — or `undefined` if it is safe.
 *
 * **This is a security control, not a tidiness check.** In Seaport the fulfiller
 * pays *every* consideration item, not the ones a frontend chooses to display.
 * A listing or bid can therefore name lines the page never mentions, and the
 * person who clicks Buy or Accept pays them out of the two standing approvals
 * this app asks for: `setApprovalForAll` on the collection, which necessarily
 * covers every token in it, and a WSOSO allowance.
 *
 * Three demonstrated thefts, all settled against real Seaport 1.6 bytecode in
 * contracts/test/SeaportHostileOrders.test.ts:
 *
 *   1. A 0.5 WSOSO bid with a second consideration line taking 500 WSOSO from
 *      the holder who accepts it.
 *   2. A bid naming two tokens where the page shows one; both are collected.
 *   3. A listing priced in SOSO with an extra WSOSO line, charged to any buyer
 *      who has ever made an offer.
 *
 * So the rule is a whitelist, not a blacklist: an order is shown only if it has
 * the shape this app itself builds. Anything else — however valid to Seaport —
 * is refused, because a shape we cannot render truthfully is a shape we cannot
 * let somebody sign.
 */
export function unsafeReason(p: OrderParameters): UnsafeReason | undefined {
  if (p.consideration.length > MAX_CONSIDERATION_ITEMS) return "too-many-consideration-items";

  /**
   * The whitelist claims to admit only "the shape this app itself builds", and
   * for a while it did not check three fields that are part of that shape.
   *
   *   zone / zoneHash  We build every order unrestricted. A restricted order
   *                    hands a contract of the maker's choosing a veto — and,
   *                    in 1.6, `authorizeOrder` runs before any transfer. It
   *                    cannot take anything the consideration does not already
   *                    name, but it can grief: refuse selectively, or burn the
   *                    fulfiller's gas on every attempt. Nothing we display
   *                    needs one.
   *   orderType        FULL_OPEN and PARTIAL_OPEN are what `buildListing` and
   *                    `buildOffer` emit. The restricted variants require a
   *                    zone; CONTRACT orders (4) are a different protocol
   *                    entirely and would not settle through our fill path.
   *   endTime          Seaport reads 0 as "no expiry", and `isExpired` agrees
   *                    with it. An immortal order is the January 2022 OpenSea
   *                    shape with the 90-day bound removed — the one mitigation
   *                    that makes a stale listing survivable.
   */
  if (p.zone !== zeroAddress) return "order-names-a-zone";
  if (p.zoneHash !== zeroHash) return "order-names-a-zone";
  if (p.orderType !== OrderType.FULL_OPEN && p.orderType !== OrderType.PARTIAL_OPEN) {
    return "order-type-unsupported";
  }
  if (p.endTime === 0n) return "order-never-expires";

  /**
   * The declared consideration count must match the array.
   *
   * Seaport treats `totalOriginalConsiderationItems` as the number of items the
   * *offerer* committed to; a fulfiller may append beyond it. An order whose
   * declared count is lower than its array therefore carries items this app
   * would display as the offerer's terms while Seaport treats them as somebody
   * else's addition — and one whose count is higher will not settle at all.
   *
   * Every order this app builds sets it from `consideration.length`. A foreign
   * order where the two disagree is not a shape we build, which is the whole
   * test this whitelist applies.
   */
  if (p.totalOriginalConsiderationItems !== BigInt(p.consideration.length)) {
    return "order-type-unsupported";
  }

  /**
   * Every amount must be fixed. Seaport interpolates between start and end over
   * the order's lifetime, so a varying amount means the price displayed is not
   * the price charged — and the direction that hurts is the one where the
   * fulfiller pays more than the page said.
   */
  for (const i of p.offer) if (i.startAmount !== i.endAmount) return "amount-varies-over-time";
  for (const i of p.consideration) {
    if (i.startAmount !== i.endAmount) return "amount-varies-over-time";
  }

  if (p.offer.length !== 1) return "offer-must-be-one-item";
  const offered = p.offer[0]!;

  const isNft = (t: number) =>
    t === ItemType.ERC721 ||
    t === ItemType.ERC1155 ||
    t === ItemType.ERC721_WITH_CRITERIA ||
    t === ItemType.ERC1155_WITH_CRITERIA;

  // ---- a listing: the NFT is offered, currency comes back -------------------
  if (offered.itemType === ItemType.ERC721 || offered.itemType === ItemType.ERC1155) {
    /**
     * Native only. The buyer's payment arrives as `msg.value`, which they see in
     * the wallet — an ERC-20 line would instead be pulled from a standing
     * allowance, silently, on top of the figure the page quoted. That is
     * attack 3.
     */
    for (const i of p.consideration) {
      if (i.itemType !== ItemType.NATIVE) return "listing-consideration-must-be-native";
      /**
       * A NATIVE item must also *be* native.
       *
       * Checking `itemType` alone let this rule and `sumOf` disagree about the
       * same item: the whitelist admitted it, and `sumOf` — which additionally
       * requires `token === zeroAddress` — skipped it when adding up the price.
       * So a listing whose consideration was [1 wei to seller, 1000 SOSO to
       * seller with token 0x…01] passed here and displayed as **1 wei**, and
       * set that collection's floor.
       *
       * Seaport refuses such an item at fill time (`_revertUnusedItemParameters`
       * when `uint160(token) | identifier != 0`), which makes it worse rather
       * than better: nobody can clear the fake by buying it, so it sits there
       * poisoning the floor for the order's full 90 days. Asserting exactly what
       * Seaport asserts makes the two agree by construction.
       */
      if (i.token !== zeroAddress || i.identifierOrCriteria !== 0n) {
        return "listing-consideration-must-be-native";
      }
    }

    /**
     * An ERC-721 offer must be for exactly one token.
     *
     * The counterpart of `bid-quantity-unsupported`, which was never written
     * for the listing side. Seaport treats an ERC-721 item's amount as 1
     * regardless, so a larger value does not move more tokens — but it does
     * change `_getFraction` arithmetic on a PARTIAL_OPEN order, and nothing on
     * screen shows an offer amount, so a listing declaring 10 would render
     * identically to one declaring 1 while filling differently.
     */
    if (offered.itemType === ItemType.ERC721 && offered.startAmount !== 1n) {
      return "offer-item-type-unsupported";
    }
    return undefined;
  }

  // ---- a bid: currency is offered, the NFT comes back -----------------------
  if (offered.itemType !== ItemType.ERC20) return "offer-item-type-unsupported";

  /**
   * Which token, absolutely — not merely "the same one throughout".
   *
   * Every other currency rule here is relative to `offered.token`. That is
   * internal consistency, and internal consistency is worthless if the token
   * itself is one the attacker wrote: the page cannot tell 1,000,000 of a
   * counterfeit from 1,000,000 WSOSO, because the unit on screen is a literal.
   */
  if (offered.token.toLowerCase() !== ACCEPTED_BID_CURRENCY.toLowerCase()) {
    return "bid-currency-not-accepted";
  }

  const nfts = p.consideration.filter((i) => isNft(i.itemType));
  if (nfts.length !== 1) return "bid-must-name-exactly-one-nft"; // attack 2
  if (nfts[0]!.recipient.toLowerCase() !== p.offerer.toLowerCase()) {
    return "bid-nft-must-go-to-the-bidder";
  }

  /**
   * A criteria item carries either zero — "any token in this contract" — or a
   * Merkle root naming a specific set.
   *
   * We can satisfy the first: the resolver supplies the identifier and an empty
   * proof. We cannot satisfy the second, because resolving a root needs the
   * original token list, which is not on chain and which this app never
   * receives. `acceptOffer` sends `criteriaProof: []` either way, so against a
   * real root Seaport rejects the proof and the holder pays gas to learn
   * nothing — having been shown the bid as takeable on any piece they own.
   *
   * Refuse it rather than advertise something we know will revert.
   */
  const criteriaItem =
    nfts[0]!.itemType === ItemType.ERC721_WITH_CRITERIA ||
    nfts[0]!.itemType === ItemType.ERC1155_WITH_CRITERIA;
  if (criteriaItem && nfts[0]!.identifierOrCriteria !== 0n) {
    return "bid-criteria-unresolvable";
  }

  /**
   * How many tokens the bid is actually for.
   *
   * Nothing displayed a bid's quantity — not the token page, not the inbox — so
   * a bid for 10,000 editions rendered identically to a bid for one, and a
   * holder of 10,000 would have handed over the lot at the price of a single.
   * Until a surface shows the quantity, only single-unit bids are accepted.
   */
  if (nfts[0]!.startAmount !== 1n) return "bid-quantity-unsupported";

  /**
   * Everything the accepting holder pays, beyond the token itself, must be in
   * the same currency they are being paid in — and must be small. Anything else
   * is attack 1 wearing a different hat.
   */
  let outlay = 0n;
  for (const i of p.consideration) {
    if (isNft(i.itemType)) continue;
    if (i.itemType !== ItemType.ERC20) return "bid-consideration-must-be-one-currency";
    if (i.token.toLowerCase() !== offered.token.toLowerCase()) {
      return "bid-consideration-must-be-one-currency";
    }
    outlay += i.startAmount;
  }

  if (outlay > (offered.startAmount * MAX_FULFILLER_OUTLAY_BPS) / BPS) {
    return "fulfiller-outlay-too-high";
  }

  return undefined;
}

export const isSafeOrder = (p: OrderParameters): boolean => unsafeReason(p) === undefined;

/**
 * What to call the currency an order is priced in.
 *
 * Every view used to print the literal "WSOSO" next to a bid's amount. With
 * `unsafeReason` now refusing any other bid currency that label is correct by
 * construction — but it was correct by luck before, and a hardcoded unit is
 * exactly how a counterfeit passes for the real thing. Deriving it means a
 * future second currency cannot silently mislabel itself.
 */
export function currencyLabel(token: Address): string {
  if (token === zeroAddress) return "SOSO";
  if (token.toLowerCase() === ACCEPTED_BID_CURRENCY.toLowerCase()) return "WSOSO";
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

export function readOrder(p: OrderParameters): ReadOrder | undefined {
  /**
   * Safety first, before anything is priced.
   *
   * Putting the check here rather than in each view is deliberate: `readOrder`
   * is the only door an order comes through, so no page can forget it and no
   * future page can reintroduce the hole.
   */
  if (!isSafeOrder(p)) return undefined;

  const nftOffered = p.offer.find(
    (i) => i.itemType === ItemType.ERC721 || i.itemType === ItemType.ERC1155,
  );

  if (nftOffered !== undefined) {
    const total = sumOf(p.consideration, zeroAddress, [ItemType.NATIVE]);
    if (total === 0n) return undefined;
    return {
      kind: "listing",
      collection: nftOffered.token,
      tokenId: nftOffered.identifierOrCriteria,
      maker: p.offerer,
      currency: zeroAddress,
      priceWei: total,
      amount: nftOffered.startAmount,
      endTime: p.endTime,
    };
  }

  const nftWanted = p.consideration.find(
    (i) =>
      i.itemType === ItemType.ERC721 ||
      i.itemType === ItemType.ERC1155 ||
      i.itemType === ItemType.ERC721_WITH_CRITERIA ||
      i.itemType === ItemType.ERC1155_WITH_CRITERIA,
  );
  const currencyOffered = p.offer.find((i) => i.itemType === ItemType.ERC20);

  if (nftWanted !== undefined && currencyOffered !== undefined) {
    const criteria =
      nftWanted.itemType === ItemType.ERC721_WITH_CRITERIA ||
      nftWanted.itemType === ItemType.ERC1155_WITH_CRITERIA;
    return {
      kind: "offer",
      collection: nftWanted.token,
      /**
       * A criteria item with `identifierOrCriteria` zero means any token in the
       * collection. A non-zero criteria value is a Merkle root, which this app
       * neither builds nor can resolve back into a token list - so it is treated
       * as collection-wide rather than misreported as a bid on token N.
       */
      tokenId: criteria ? undefined : nftWanted.identifierOrCriteria,
      maker: p.offerer,
      currency: currencyOffered.token,
      priceWei: currencyOffered.startAmount,
      amount: nftWanted.startAmount,
      endTime: p.endTime,
    };
  }

  return undefined;
}

/**
 * The items as they appear in `OrderFulfilled`, which is a different shape from
 * the order's own.
 *
 * Seaport reports what actually moved rather than what was asked for, so the
 * start/end amounts collapse to one `amount` and `identifierOrCriteria` becomes
 * a resolved `identifier`. Same idea, different struct - and mixing the two up
 * yields a decode that succeeds and produces nonsense, so they are kept apart.
 */
export interface SpentItem {
  itemType: number;
  token: Address;
  identifier: bigint;
  amount: bigint;
}

export interface ReceivedItem extends SpentItem {
  recipient: Address;
}

export interface Fulfilment {
  collection: Address;
  tokenId: bigint;
  /** Units moved. 1 for ERC-721, the lot size for an edition. */
  amount: bigint;
  /** Total paid, fee included. */
  priceWei: bigint;
  currency: Address;
  seller: Address;
  buyer: Address;
}

/**
 * What a settled order actually did.
 *
 * Which side the NFT moved on decides who was the seller, and it is not the
 * offerer either way: on a filled listing the offerer sold, on an accepted bid
 * the offerer bought. Reading it from the items rather than assuming is what
 * keeps an accepted bid from being recorded with the buyer and seller swapped -
 * a mistake that would be invisible in the total volume and wrong on every row.
 */
export function readFulfilment(
  offerer: Address,
  recipient: Address,
  offer: readonly SpentItem[],
  consideration: readonly ReceivedItem[],
): Fulfilment | undefined {
  const isNft = (t: number) => t === ItemType.ERC721 || t === ItemType.ERC1155;

  /**
   * A settled sale is a price signal, and an ungated one is C1 again.
   *
   * `readOrder` refuses an order it cannot describe truthfully. This function
   * had no such gate: it summed every currency item blindly, and `useActivity`
   * dropped the currency on the floor while `Activity` rendered the number with
   * no unit at all — so it read as SOSO whatever it was.
   *
   * The consequence is not a wrong label, it is a fabricated market. An
   * attacker wash-trades with themselves in a token they minted, and the piece
   * shows "last sale 1,000,000" to every visitor who comes to value it. The
   * history is what a buyer checks precisely because asking prices are cheap
   * talk.
   *
   * So: only settlements denominated in native SOSO or the accepted bid
   * currency are reported at all.
   */
  const recognised = (token: Address) =>
    token === zeroAddress || token.toLowerCase() === ACCEPTED_BID_CURRENCY.toLowerCase();

  /**
   * A trade with yourself is not a sale.
   *
   * The currency gate stops a wash trade in a token the attacker minted, but it
   * does nothing about a wash trade in a *real* one: fill your own order and
   * the money goes in a circle, costing gas and nothing else, while the piece
   * records a "last sale" at whatever figure you chose. Every price signal on
   * the site is built from these rows — last sale, volume, the floor a buyer
   * anchors on.
   *
   * Seaport has no opinion here and should not: settling an order between two
   * addresses that happen to be one address is a perfectly valid settlement.
   * Whether it counts as a market is our question, not its.
   *
   * Checked before either branch — a self-fill is a self-fill whether the
   * offerer was selling or bidding.
   */
  if (offerer.toLowerCase() === recipient.toLowerCase()) return undefined;

  const sold = offer.find((i) => isNft(i.itemType));
  if (sold !== undefined) {
    // A listing: the offerer gave the NFT and was paid in the consideration.
    let priceWei = 0n;
    for (const c of consideration) {
      if (c.itemType !== ItemType.NATIVE && c.itemType !== ItemType.ERC20) continue;
      if (!recognised(c.token)) return undefined;
      priceWei += c.amount;
    }
    if (priceWei === 0n) return undefined;
    const currency = consideration.find(
      (c) => c.itemType === ItemType.NATIVE || c.itemType === ItemType.ERC20,
    );
    return {
      collection: sold.token,
      tokenId: sold.identifier,
      amount: sold.amount,
      priceWei,
      currency: currency?.token ?? zeroAddress,
      seller: offerer,
      buyer: recipient,
    };
  }

  // A bid: the offerer paid, and the NFT went to them out of the consideration.
  const bought = consideration.find((c) => isNft(c.itemType));
  const paid = offer.find((i) => i.itemType === ItemType.ERC20 || i.itemType === ItemType.NATIVE);
  if (bought === undefined || paid === undefined) return undefined;
  if (!recognised(paid.token)) return undefined;


  return {
    collection: bought.token,
    tokenId: bought.identifier,
    amount: bought.amount,
    priceWei: paid.amount,
    currency: paid.token,
    seller: recipient,
    buyer: offerer,
  };
}

function sumOf(items: readonly ConsiderationItem[], token: Address, types: number[]): bigint {
  let total = 0n;
  for (const i of items) {
    if (!types.includes(i.itemType)) continue;
    if (i.token.toLowerCase() !== token.toLowerCase()) continue;
    total += i.startAmount;
  }
  return total;
}

/**
 * How far back the order book has to look.
 *
 * Every order this app builds expires — 90 days at the very most, and the offer
 * form caps at 90 too. So a live order can never be older than that, and
 * scanning from Seaport's deployment block forever would spend more and more
 * requests each month re-reading orders that expired long ago.
 *
 * ValueChain makes a block roughly every 2.07 seconds, so 90 days is about
 * 3.76M blocks. The window below is ~108 days: comfortably past the longest
 * order anyone can make here, with margin for the block rate drifting faster
 * than measured. Getting this too small would silently hide live orders, so it
 * errs long.
 *
 * The limitation, stated plainly: an order with an expiry beyond this window —
 * which nothing in this app can create, but a script or another frontend could —
 * would not be shown. That is a deliberate trade against an unbounded scan.
 */
export const ORDER_BOOK_WINDOW_BLOCKS = 4_500_000n;

/**
 * Rounding the floor down to this boundary is what keeps the scan cached.
 *
 * The floor is derived from the head block, and the head moves every two
 * seconds. Used raw it would produce a different `fromBlock` on every poll,
 * which is a different cache key in `logScan` — so every 30-second refetch
 * would re-read the entire window from scratch, turning a cache into a
 * guarantee of maximum work. Rounded to 250,000 blocks it changes about once a
 * week instead.
 */
const FLOOR_ROUNDING = 250_000n;

export function orderBookFloor(head: bigint, deployedAt: bigint): bigint {
  if (head <= deployedAt + ORDER_BOOK_WINDOW_BLOCKS) return deployedAt;
  const rounded = ((head - ORDER_BOOK_WINDOW_BLOCKS) / FLOOR_ROUNDING) * FLOOR_ROUNDING;
  return rounded > deployedAt ? rounded : deployedAt;
}

/** Has this order run out of time? Seaport refuses it either way; this is for the UI. */
export function isExpired(endTime: bigint, now: number = Math.floor(Date.now() / 1000)): boolean {
  return endTime !== 0n && endTime <= BigInt(now);
}

/** A live order, as the app carries it: what it means, plus what it takes to fill it. */
export interface SeaportOrder extends ReadOrder {
  /** Seaport's own hash, taken from the `OrderValidated` event rather than recomputed. */
  hash: Hex;
  /**
   * The order itself. Filling or cancelling needs every field back - Seaport
   * addresses orders by a hash over all of them - so the summary above is never
   * enough on its own.
   */
  params: OrderParameters;
  /** The block that put it on chain. The only "created at" an order has. */
  blockNumber: bigint;
  /** ERC-1155 partial fills: how much is already taken, out of `size`. */
  filled: bigint;
  size: bigint;
  /**
   * Whether this order could actually settle right now.
   *
   * Seaport knows nothing about it. An order stays `validated` forever unless
   * someone cancels it, so a seller who parts with the token — by accepting a
   * bid, or by simply sending it away — leaves a listing that still looks
   * perfect and reverts on contact.
   *
   * That is not only cosmetic. A standing order becomes live again the moment
   * the token comes back, at the old price: the January 2022 OpenSea incident,
   * roughly $1M. Expiry bounds it at 90 days; this hides it in the meantime.
   *
   * False means: the maker no longer holds what they promised, or has revoked
   * Seaport's permission to move it, or (for a bid) no longer has the funds
   * behind it.
   */
  fillable: boolean;
  /**
   * Why not, when not. Undefined when the order is fillable.
   *
   * Free: read off the same two answers `fillable` is decided from, rather
   * than fetched. See `unfillableReason`.
   */
  unfillable?: Unfillable;
}

/**
 * A listing in the shape the UI has always used.
 *
 * Deliberately a view over `SeaportOrder` rather than a replacement for it. Every
 * card, row and panel in this app already reads `listing.price` and
 * `listing.seller`, and those words mean exactly the same thing under Seaport -
 * renaming them across fifteen display files would be churn with no behavioural
 * gain and fifteen chances to break something.
 *
 * What is new is `order`. Buying or cancelling needs the full parameters, so the
 * order travels with its own summary and no call site has to look it up again.
 */
export interface Listing {
  seller: Address;
  paymentToken: Address;
  price: bigint;
  expiry: bigint;
  order: SeaportOrder;
}

export function toListing(order: SeaportOrder): Listing {
  return {
    seller: order.maker,
    paymentToken: order.currency,
    price: order.priceWei,
    expiry: order.endTime,
    order,
  };
}

/**
 * Can this listing still settle?
 *
 * Seaport tracks cancellation and fills and nothing else, so a listing survives
 * its own token being handed to someone else — and springs back to life if the
 * token ever returns, at the old price. That is the January 2022 OpenSea
 * incident, and the reason this is a named, tested rule rather than a condition
 * inside a component.
 *
 * `holder` is the current owner for an ERC-721, or the maker's balance for an
 * ERC-1155.
 */
export function listingIsFillable(
  order: Pick<ReadOrder, "maker" | "amount">,
  holder: Address | bigint,
  approved: boolean,
): boolean {
  if (!approved) return false;
  return typeof holder === "bigint"
    ? holder >= order.amount
    : holder.toLowerCase() === order.maker.toLowerCase();
}

/**
 * Can this bid still settle?
 *
 * A bidder who spent or unwrapped their WSOSO leaves an offer that a holder can
 * accept, pay gas for, and watch revert. Showing it is worse than not showing
 * it: it costs the holder money to find out.
 */
export function offerIsFillable(
  order: Pick<ReadOrder, "priceWei">,
  balance: bigint,
  allowance: bigint,
): boolean {
  return balance >= order.priceWei && allowance >= order.priceWei;
}

/** One entry of a wagmi multicall: it either answered or it did not. */
export type ChainAnswer = { status: "success" | "failure"; result?: unknown };

/**
 * Whether an order can be filled right now, from the two reads that decide it.
 *
 * Extracted from `useSeaportOrders` so it can be tested, because it is a
 * security rule rather than a rendering detail and it has been wrong twice in
 * two different directions.
 *
 * Three inputs, three outcomes, and the whole point is that they are three:
 *
 *   checks undefined   the reads have not landed. NOT fillable. "I have not
 *                      checked" is not evidence that something is buyable, and
 *                      this is the read that decides whether the seller still
 *                      owns the token. Seaport tracks cancellation and fills
 *                      and nothing else, so accepting an offer on a listed
 *                      token leaves that listing valid on chain while the token
 *                      walks away - ownership is the only thing that retires
 *                      it. Treating unknown as fillable published those as
 *                      buyable, and clicking one costs the buyer gas on a
 *                      revert. The caller reports this state as *loading* so a
 *                      page shows skeletons rather than a wrongly empty market.
 *
 *   a read reverted    an answer, and the answer is no. `ownerOf` reverts on an
 *                      id that does not exist, and `validate()` checks nothing
 *                      about ownership - so anyone could publish a well-shaped
 *                      listing offering token 999999 of a real collection at
 *                      any price. It passed `unsafeReason`, `ownerOf` reverted,
 *                      and an earlier version called that fillable; the fake
 *                      then set the collection's floor.
 *
 *   both succeeded     the real rules, `listingIsFillable` / `offerIsFillable`.
 */
export function resolveFillable(
  order: Pick<ReadOrder, "maker" | "amount" | "priceWei" | "kind"> & {
    params: { offer: ReadonlyArray<{ itemType: number }> };
  },
  checks: { first: ChainAnswer | undefined; second: ChainAnswer | undefined } | undefined,
): boolean {
  // Not checked yet. Never "probably fine".
  if (checks === undefined) return false;

  const { first, second } = checks;
  if (first?.status !== "success" || second?.status !== "success") return false;

  if (order.kind === "listing") {
    const isMulti = order.params.offer[0]?.itemType === ItemType.ERC1155;
    const holder = isMulti ? (first.result as bigint) : (first.result as Address);
    return listingIsFillable(order, holder, second.result === true);
  }

  return offerIsFillable(order, first.result as bigint, second.result as bigint);
}

/**
 * Why a listing cannot be filled, when it cannot.
 *
 * A companion to `resolveFillable`, not a replacement: that one is a security
 * rule with its own tests and it stays exactly as it is, answering yes or no.
 * This reads the same two answers for a different purpose — telling somebody
 * what happened.
 *
 * Nothing extra is fetched. The reads that decide fillability are already made
 * for every standing order on every poll, and all three facts are in them; they
 * were simply collapsed into one `false` and thrown away:
 *
 *   ownerOf reverted        the token does not exist any more
 *   ownerOf is someone else the maker handed it on
 *   not approved            the maker withdrew Seaport's permission
 *
 * ## Why a revert means burned here, and not "never existed"
 *
 * `ownerOf` reverts for an id that was burned and for one that was never
 * minted, and in general those are not distinguishable. They are here, because
 * this is only ever asked about a token somebody published a listing for: to
 * have been listed it had to exist. That is what turns the revert into an
 * answer.
 *
 * ## ERC-1155
 *
 * `balanceOf` cannot tell a burn from a transfer — both leave zero — so a
 * multi-token order never reports `gone`, only `moved`. Saying "burned" on
 * evidence that cannot distinguish the two would be a guess dressed as a fact.
 *
 * Bids are out of scope and return undefined: a bid failing is about the
 * bidder's money, which is not this question.
 */
export type Unfillable = "checking" | "gone" | "moved" | "unapproved";

export function unfillableReason(
  order: Pick<ReadOrder, "maker" | "amount" | "kind"> & {
    params: { offer: ReadonlyArray<{ itemType: number }> };
  },
  checks: { first: ChainAnswer | undefined; second: ChainAnswer | undefined } | undefined,
): Unfillable | undefined {
  if (order.kind !== "listing") return undefined;
  if (checks === undefined) return "checking";

  const { first, second } = checks;
  if (first === undefined || second === undefined) return "checking";

  const isMulti = order.params.offer[0]?.itemType === ItemType.ERC1155;

  if (first.status === "failure") {
    // A balance read that reverts is a broken contract, not a burned token.
    return isMulti ? "checking" : "gone";
  }
  // Anything else failing is a read we could not make, not a fact about the
  // order. "I do not know" must never be reported as "it is gone".
  if (second.status !== "success") return "checking";

  if (second.result !== true) return "unapproved";

  const holder = isMulti ? (first.result as bigint) : (first.result as Address);
  return listingIsFillable(order, holder, true) ? undefined : "moved";
}

/**
 * How many listings ride in one `validate()` call.
 *
 * `validate` takes `Order[]`, and this app had always passed an array of one -
 * so listing 626 treasure boxes was 626 wallet confirmations. The boxes are
 * handed out in the thousands and unevenly, so a holder with hundreds is the
 * normal case rather than the exception.
 *
 * **Gas is not what binds.** Measured with `eth_estimateGas` against the live
 * chain, against a 30,000,000 block limit:
 *
 *       1 order       63,839 gas        964 B calldata
 *      50 orders   1,978,570 gas     44,868 B
 *     100 orders   3,940,625 gas     89,668 B
 *     200 orders   7,891,878 gas    179,268 B
 *
 * 200 fits the block with room to spare. What it does not fit is the
 * *transaction* size limit - geth's default `txMaxSize` is 128 KB, and 200
 * orders is 179 KB, so the node would drop it before it ever reached a block.
 * 100 is 89 KB, under the cap with no margin worth having.
 *
 * 50 is 45 KB - a 2.9x margin - and 2.0M gas, under 7% of a block. It turns 626
 * listings into 13 transactions, which is the difference between a feature and
 * a dare.
 */
export const LISTINGS_PER_TX = 50;

/**
 * Every order for a bulk listing, split into transaction-sized batches.
 *
 * Pure, and here rather than in the hook for the reason the top of this file
 * gives: a wrong order does not throw, it settles and pays the wrong person.
 * Building hundreds at once makes that worse, not better - one mistake is
 * repeated hundreds of times and signed in a single click - so the part that
 * decides what each order *says* is testable on its own.
 *
 * Every order gets its own random salt from `buildListing`, so no two collide
 * even at the same price, in the same second, for the same seller.
 */
export function planBulkListing(input: {
  seller: Address;
  collection: Address;
  tokenIds: readonly bigint[];
  priceWei: bigint;
  days?: number;
  perTx?: number;
}): OrderParameters[][] {
  const perTx = input.perTx ?? LISTINGS_PER_TX;
  if (perTx < 1) throw new Error("A batch must carry at least one order.");
  if (input.priceWei <= 0n) throw new Error("A listing needs a price above zero.");

  /**
   * The same token twice would be two live orders for one item: whoever fills
   * the second gets nothing and pays anyway. Cheap to prevent here, and
   * impossible to notice once signed.
   */
  const unique = [...new Set(input.tokenIds.map((id) => id.toString()))].map((id) => BigInt(id));

  const orders = unique.map((tokenId) =>
    buildListing({
      seller: input.seller,
      collection: input.collection,
      tokenId,
      priceWei: input.priceWei,
      days: input.days,
    }),
  );

  const batches: OrderParameters[][] = [];
  for (let i = 0; i < orders.length; i += perTx) batches.push(orders.slice(i, i + perTx));
  return batches;
}

/** Turn order parameters back into the shape `cancel` and `getOrderHash` want. */
export function toComponents(p: OrderParameters, counter: bigint): OrderComponents {
  const { totalOriginalConsiderationItems: _total, ...rest } = p;
  void _total;
  return { ...rest, counter };
}

/**
 * The wire form. viem wants mutable arrays, and the `readonly` arrays that come
 * back off a decoded log do not satisfy the ABI's tuple types.
 */
/**
 * An order in the shape `validate` and `fulfillOrder` want.
 *
 * The signature is always empty. Orders here are authorised by being the
 * `msg.sender` of `validate` rather than by an EIP-712 signature - there is no
 * server to keep signed orders in, so the chain is the order book.
 *
 * Here rather than in a hook because two hooks now build orders: one at a time,
 * and `useBulkList` fifty at a time. Two copies of the wire shape is exactly the
 * kind of divergence this file exists to prevent.
 */
export const asOrder = (params: OrderParameters) => ({
  parameters: toWire(params),
  signature: "0x" as const,
});

export function toWire(p: OrderParameters) {
  return {
    ...p,
    offer: p.offer.map((i) => ({ ...i })),
    consideration: p.consideration.map((i) => ({ ...i })),
  };
}
