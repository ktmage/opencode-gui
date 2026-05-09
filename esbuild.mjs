import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const buildOptions = {
  entryPoints: ["extension/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  alias: {
    "@shared": "./shared/index.ts",
  },
  format: "cjs",
  platform: "node",
  target: "node22",
  sourcemap: true,
  // @opencode-ai/sdk は ESM のみ提供のため、バンドルに含める
  mainFields: ["module", "main"],
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
}
