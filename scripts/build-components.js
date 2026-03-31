import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entryPoint = resolve(rootDir, "component-library", "src", "index.js");
const watchMode = process.argv.includes("--watch");

const targets = [
  {
    label: "esm",
    format: "esm",
    outfile: resolve(rootDir, "dist", "components", "byda-components.esm.js"),
  },
  {
    label: "browser",
    format: "iife",
    globalName: "BydaComponents",
    outfile: resolve(rootDir, "dist", "components", "byda-components.js"),
  },
  {
    label: "playground",
    format: "iife",
    globalName: "BydaComponents",
    outfile: resolve(rootDir, "public", "components", "byda-components.js"),
  },
];

async function createContext(target) {
  await mkdir(dirname(target.outfile), { recursive: true });

  return esbuild.context({
    bundle: true,
    entryPoints: [entryPoint],
    format: target.format,
    globalName: target.globalName,
    legalComments: "none",
    minify: false,
    outfile: target.outfile,
    platform: "browser",
    sourcemap: true,
    target: ["es2020"],
  });
}

async function main() {
  const contexts = await Promise.all(targets.map(createContext));

  if (watchMode) {
    await Promise.all(contexts.map((context) => context.watch()));
    console.log("Watching component bundles...");
    targets.forEach((target) => {
      console.log(`  ${target.label}: ${target.outfile}`);
    });
    return;
  }

  await Promise.all(contexts.map((context) => context.rebuild()));
  await Promise.all(contexts.map((context) => context.dispose()));

  console.log("Built component bundles:");
  targets.forEach((target) => {
    console.log(`  ${target.label}: ${target.outfile}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
