/**
 * EIP-1155's `{id}` URI substitution.
 *
 * ERC-721 returns a finished URL from `tokenURI(id)`. ERC-1155 returns a
 * template from `uri(id)` and expects the client to substitute — the EIP
 * encourages one template for a whole collection rather than a string per
 * token, which is the same "metadata is generated, not stored" idea this
 * project already applies to its own collections.
 *
 * The rule is exact: lowercase hex, zero-padded to 64 characters, no `0x`.
 * Decimal, unpadded, uppercase or prefixed all produce a URL that 404s, and the
 * only symptom is a token with no artwork — which reads as a broken collection
 * rather than a broken client. Hence the tests.
 */
export function expandIdTemplate(template: string, tokenId: bigint): string {
  if (!template.includes("{id}")) return template;
  return template.replaceAll("{id}", tokenId.toString(16).padStart(64, "0"));
}
