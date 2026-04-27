import { copyFile, mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginDir = path.resolve(rootDir, "wordpress", "byda-iet");
const assetsDir = path.resolve(pluginDir, "assets", "js");
const sourceBundle = path.resolve(rootDir, "dist", "components", "byda-components.js");
const sourceMap = path.resolve(rootDir, "dist", "components", "byda-components.js.map");
const targetBundle = path.resolve(assetsDir, "byda-components.js");
const targetMap = path.resolve(assetsDir, "byda-components.js.map");
const zipPath = path.resolve(rootDir, "wordpress", "byda-iet.zip");

async function main() {
  execFileSync("node", [path.resolve(rootDir, "scripts", "build-components.js")], {
    cwd: rootDir,
    stdio: "inherit",
  });

  await mkdir(assetsDir, { recursive: true });
  await copyFile(sourceBundle, targetBundle);
  await copyFile(sourceMap, targetMap);
  await rm(zipPath, { force: true });

  const escapedPluginDir = pluginDir.replace(/'/g, "''");
  const escapedZipPath = zipPath.replace(/'/g, "''");

  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${escapedPluginDir}' -DestinationPath '${escapedZipPath}' -Force`,
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );

  console.log(`Built WordPress plugin zip: ${zipPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
