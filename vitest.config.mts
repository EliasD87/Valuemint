import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests for the pure logic in `lib/`.
 *
 * Deliberately not a component-rendering setup. What is worth testing first is
 * the code where a mistake is silent and expensive — what counts as an image,
 * how a log range is paged — not whether a div has a class.
 *
 * `.mts` so the config is loaded as ESM; as `.ts` Vite's native loader reads it
 * as CommonJS and warns on every run.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "config/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      /**
       * `server-only` exists to throw if a module is pulled into a client
       * bundle. That guard is exactly right in the app and useless in a test
       * runner, where there is no server/client boundary to protect — importing
       * it outside a React Server Component throws before a single test runs.
       * Stubbed to nothing so the modules it guards stay testable.
       */
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
});
