#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function parseArgs(argv) {
  const result = {
    clientId: "",
    manifestPath: "extension/manifest.json"
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--client-id" && argv[i + 1]) {
      result.clientId = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (arg === "--manifest" && argv[i + 1]) {
      result.manifestPath = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
  }

  return result;
}

function assertClientId(value) {
  if (!value) {
    throw new Error("Missing --client-id value.");
  }
  if (!value.endsWith(".apps.googleusercontent.com")) {
    throw new Error("OAuth client ID must end with .apps.googleusercontent.com");
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  assertClientId(args.clientId);

  const manifestFullPath = resolve(process.cwd(), args.manifestPath);
  const raw = readFileSync(manifestFullPath, "utf8");
  const manifest = JSON.parse(raw);

  if (!manifest.oauth2 || typeof manifest.oauth2 !== "object") {
    throw new Error("manifest.oauth2 is missing.");
  }

  manifest.oauth2.client_id = args.clientId;
  writeFileSync(manifestFullPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Updated OAuth client ID in ${args.manifestPath}`);
}

main();
