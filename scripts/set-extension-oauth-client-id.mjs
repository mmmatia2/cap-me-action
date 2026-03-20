#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

function parseArgs(argv) {
  const result = {
    clientId: "",
    key: "",
    manifestPath: "extension/manifest.json",
    printExtensionId: false
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
    if (arg === "--key" && argv[i + 1]) {
      result.key = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (arg === "--print-extension-id") {
      result.printExtensionId = true;
      continue;
    }
  }

  return result;
}

function assertClientId(value) {
  if (!value.endsWith(".apps.googleusercontent.com")) {
    throw new Error("OAuth client ID must end with .apps.googleusercontent.com");
  }
}

function assertPublicKey(value) {
  if (!value) {
    throw new Error("Missing extension manifest key. Provide --key once to stabilize extension identity.");
  }
  try {
    const bytes = Buffer.from(value, "base64");
    if (!bytes.length) {
      throw new Error("empty");
    }
  } catch {
    throw new Error("Manifest key must be base64-encoded DER public key bytes.");
  }
}

function deriveExtensionIdFromManifestKey(base64Key) {
  const alphabet = "abcdefghijklmnop";
  const keyBytes = Buffer.from(base64Key, "base64");
  const hash = createHash("sha256").update(keyBytes).digest();
  const first16 = hash.subarray(0, 16);

  let extensionId = "";
  for (const byte of first16) {
    extensionId += alphabet[(byte >> 4) & 0x0f];
    extensionId += alphabet[byte & 0x0f];
  }
  return extensionId;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestFullPath = resolve(process.cwd(), args.manifestPath);
  const raw = readFileSync(manifestFullPath, "utf8");
  const manifest = JSON.parse(raw);
  let changed = false;

  if (args.key) {
    assertPublicKey(args.key);
    manifest.key = args.key;
    changed = true;
  }

  const manifestKey = String(manifest.key ?? "").trim();
  assertPublicKey(manifestKey);

  if (args.clientId) {
    assertClientId(args.clientId);
    if (!manifest.oauth2 || typeof manifest.oauth2 !== "object") {
      throw new Error("manifest.oauth2 is missing.");
    }
    manifest.oauth2.client_id = args.clientId;
    changed = true;
  }

  if (changed) {
    writeFileSync(manifestFullPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(`Updated extension identity fields in ${args.manifestPath}`);
  }

  const extensionId = deriveExtensionIdFromManifestKey(manifestKey);
  if (args.printExtensionId || !args.clientId) {
    console.log(`Extension ID (derived from manifest.key): ${extensionId}`);
  }
}

main();
