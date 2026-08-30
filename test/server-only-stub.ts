/**
 * Stands in for the `server-only` package under vitest.
 *
 * The real package throws on import outside a React Server Component, which is
 * the point of it — but a test runner has no such boundary, so importing any
 * server module would fail before reaching a test. Empty on purpose.
 */
export {};
