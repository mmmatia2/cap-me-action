#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
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

function listFilesRecursively(rootDir) {
  const files = [];

  function walk(currentDir) {
    const entries = readdirSync(currentDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      files.push(fullPath);
    }
  }

  walk(rootDir);
  return files;
}

function main() {
  const repoRoot = process.cwd();
  const rootManifestPath = resolve(repoRoot, "extension", "manifest.json");
  const rootManifest = JSON.parse(readFileSync(rootManifestPath, "utf8"));
  const version = String(rootManifest.version || "0.0.0");
  const extensionNameSlug = slugify(rootManifest.name || "extension");
  const defaultArtifactDir = resolve(repoRoot, "artifacts", "extension", `${extensionNameSlug}-v${version}`);
  const artifactDir = resolve(repoRoot, parseArgs(process.argv.slice(2)).artifactDir || defaultArtifactDir);
  const packagedExtensionDir = resolve(artifactDir, "extension");
  const packagedManifestPath = resolve(packagedExtensionDir, "manifest.json");
  const artifactManifestPath = resolve(artifactDir, "artifact-manifest.json");

  const packagedManifest = JSON.parse(readFileSync(packagedManifestPath, "utf8"));
  const expectedExtensionId = deriveExtensionIdFromManifestKey(String(rootManifest.key || ""));
  const packagedFiles = listFilesRecursively(packagedExtensionDir);

  if (packagedManifest.version !== rootManifest.version) {
    throw new Error(`Manifest version mismatch: root=${rootManifest.version} packaged=${packagedManifest.version}`);
  }
  if (packagedManifest.name !== rootManifest.name) {
    throw new Error(`Manifest name mismatch: root=${rootManifest.name} packaged=${packagedManifest.name}`);
  }

  statSync(packagedExtensionDir);

  console.log(`Artifact path: ${artifactDir}`);
  console.log(`Load unpacked from: ${packagedExtensionDir}`);
  console.log(`Manifest version: ${rootManifest.version}`);
  console.log(`Expected extension ID: ${expectedExtensionId}`);
  console.log(`Packaged files: ${packagedFiles.length}`);
  try {
    readFileSync(artifactManifestPath, "utf8");
    console.log(`Artifact manifest: ${artifactManifestPath}`);
  } catch {
    console.log("Artifact manifest: not present (verification does not require it).");
  }
  console.log("Chrome install step: open chrome://extensions, enable Developer mode, and load the packaged extension/ folder.");
}

main();
