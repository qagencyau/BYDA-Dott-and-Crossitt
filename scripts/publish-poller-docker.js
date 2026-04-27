import { spawnSync } from "node:child_process";
import process from "node:process";

import { config as loadEnv } from "dotenv";

loadEnv();

const DEFAULT_CONTEXT = "./poller";

function parseArgs(argv) {
  const args = {
    image: "",
    tag: "",
    context: DEFAULT_CONTEXT,
    latest: true,
    push: true,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--image") {
      args.image = next || "";
      index += 1;
    } else if (arg === "--tag") {
      args.tag = next || "";
      index += 1;
    } else if (arg === "--context") {
      args.context = next || "";
      index += 1;
    } else if (arg === "--no-latest") {
      args.latest = false;
    } else if (arg === "--no-push") {
      args.push = false;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.image) {
    args.image = process.env.DOCKER_IMAGE || "";
  }

  if (!args.image) {
    throw new Error("Missing --image. Example: --image your-dockerhub-user/byda-iet-poller");
  }

  if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(args.image)) {
    throw new Error("--image must be in Docker Hub namespace/repository form, e.g. your-user/byda-iet-poller");
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  npm run publish:poller-docker -- --image <namespace/repository> [options]

Options:
  --image <namespace/repository>  Docker Hub image name. Can also use DOCKER_IMAGE.
  --tag <vN>                     Explicit tag. If omitted, the script reads Docker Hub tags and increments the highest vN tag.
  --context <path>                Docker build context. Default: ${DEFAULT_CONTEXT}
  --no-latest                    Do not also tag/push latest.
  --no-push                      Build only; do not push.
  --dry-run                      Print commands without running docker.

Private repositories:
  Set DOCKERHUB_USERNAME and DOCKERHUB_TOKEN so the script can read private tags from Docker Hub.`);
}

async function getDockerHubToken() {
  const username = process.env.DOCKERHUB_USERNAME || "";
  const password = process.env.DOCKERHUB_TOKEN || process.env.DOCKERHUB_PASSWORD || "";

  if (!username || !password) {
    return "";
  }

  const response = await fetch("https://hub.docker.com/v2/users/login/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(`Docker Hub login failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  return payload.token || "";
}

async function fetchDockerHubTags(image) {
  const [namespace, repository] = image.split("/");
  const token = await getDockerHubToken();
  const tags = [];
  let url = `https://hub.docker.com/v2/repositories/${encodeURIComponent(namespace)}/${encodeURIComponent(repository)}/tags?page_size=100`;

  while (url) {
    const response = await fetch(url, {
      headers: token ? { Authorization: `JWT ${token}` } : {},
    });

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new Error(`Failed to read Docker Hub tags for ${image}: HTTP ${response.status}.`);
    }

    const payload = await response.json();
    const results = Array.isArray(payload.results) ? payload.results : [];
    for (const result of results) {
      if (result && typeof result.name === "string") {
        tags.push(result.name);
      }
    }

    url = payload.next || "";
  }

  return tags;
}

async function resolveTag(args) {
  if (args.tag) {
    if (!/^v\d+$/.test(args.tag)) {
      throw new Error("--tag must use vN format, e.g. v1 or v12.");
    }
    return args.tag;
  }

  const tags = await fetchDockerHubTags(args.image);
  const latestVersion = tags.reduce((max, tag) => {
    const match = /^v(\d+)$/.exec(tag);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `v${latestVersion + 1}`;
}

function run(command, commandArgs, args) {
  const rendered = [command, ...commandArgs].join(" ");
  console.log(`> ${rendered}`);

  if (args.dryRun) {
    return;
  }

  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${rendered}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tag = await resolveTag(args);
  const versionedImage = `${args.image}:${tag}`;
  const latestImage = `${args.image}:latest`;

  const buildArgs = ["build", "-t", versionedImage];
  if (args.latest) {
    buildArgs.push("-t", latestImage);
  }
  buildArgs.push(args.context);

  run("docker", buildArgs, args);

  if (args.push) {
    run("docker", ["push", versionedImage], args);
    if (args.latest) {
      run("docker", ["push", latestImage], args);
    }
  }

  console.log(`Poller image tag: ${versionedImage}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
