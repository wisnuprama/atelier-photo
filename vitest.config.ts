import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
    pool: "forks", // required: better-sqlite3 native addon can't share worker threads
    isolate: true,
    server: {
      deps: {
        external: ["better-sqlite3", /\.node$/],
      },
    },
  },
});
