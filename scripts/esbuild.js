// Bundles the client TypeScript entry → public/js/app.js.
// Run with `--watch` for incremental dev builds.
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ["src/client/ts/main.ts"],
  bundle: true,
  format: "esm",
  target: ["es2022"],
  outfile: "public/js/app.js",
  sourcemap: true,
  minify: !watch,
  logLevel: "info",
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("esbuild: watching client TS…");
} else {
  await build(options);
}
