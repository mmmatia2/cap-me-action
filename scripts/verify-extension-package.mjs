#!/usr/bin/env node

import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

function parseArgs(argv) {
  const result = {
    artifactDir: ""
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--artifact-dir" && argv[i + 1]) {
      result.artifactDir = String(argv[i + 1]).trim();
      i += 1;
    }
  }

  return result;
}

function slugify(value) {
  return String(value || "extension")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
  const repoRoot = process.cwd();
  const rootManifestPath = resolve(repoRoot, "extension", "manifest.json");
  const rootManifest = JSON.parse(readFileSync(rootManifestPath, "utf8"));
  const version = String(rootManifest.version || "0.0.0");
  const extensionNameSlug = slugify(rootManifest.name || "extension");
  const defaultArtifactDir = resolve(repoRoot, "artifacts", "extension", `${extensionNameSlug}-v${version}`);
  const artifactDir = resolve(repoRoot, parseArgs(process.argv.slice(2)).artifactDir || defaultArtifactDir);
  const artifactManifestPath = resolve(artifactDir, "artifact-manifest.json");
  const packagedExtensionDir = resolve(artifactDir, "extension");
  const packagedManifestPath = resolve(packagedExtensionDir, "manifest.json");

  const artifactManifest = JSON.parse(readFileSync(artifactManifestPath, "utf8"));
  const packagedManifest = JSON.parse(readFileSync(packagedManifestPath, "utf8"));
  const expectedExtensionId = deriveExtensionIdFromManifestKey(String(rootManifest.key || ""));

  if (packagedManifest.version !== rootManifest.version) {
    throw new Error(`Manifest version mismatch: root=${rootManifest.version} packaged=${packagedManifest.version}`);
  }
  if (artifactManifest.version !== rootManifest.version) {
    throw new Error(`Artifact manifest version mismatch: root=${rootManifest.version} artifact=${artifactManifest.version}`);
  }
  if (artifactManifest.extensionName !== rootManifest.name) {
    throw new Error(`Artifact name mismatch: root=${rootManifest.name} artifact=${artifactManifest.extensionName}`);
  }

  statSync(packagedExtensionDir);

  console.log(`Artifact path: ${artifactDir}`);
  console.log(`Load unpacked from: ${packagedExtensionDir}`);
  console.log(`Manifest version: ${rootManifest.version}`);
  console.log(`Expected extension ID: ${expectedExtensionId}`);
  console.log(`Packaged files: ${Array.isArray(artifactManifest.files) ? artifactManifest.files.length : 0}`);
  console.log("Chrome install step: open chrome://extensions, enable Developer mode, and load the packaged extension/ folder.");
}

main();
