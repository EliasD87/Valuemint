/**
 * Below this, a balance reads "0.00" at two places and buys nothing, so it is
 * treated as empty: 0.005 SOSO, in wei.
 */
export const EMPTY_BELOW = 5n * 10n ** 15n;

/**
 * Whether a SOSO balance is empty enough to offer the way to get some.
 *
 * `undefined` is "not read yet", never "empty": offering help to a wallet
 * whose balance simply has not loaded would tell a funded user their SOSO is
 * missing.
 */
export function needsSoso(balance: bigint | undefined): boolean {
  return balance !== undefined && balance < EMPTY_BELOW;
}
