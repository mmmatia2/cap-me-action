#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repoRoot = process.cwd();
const extensionDir = resolve(repoRoot, "extension");
const outputRoot = resolve(repoRoot, "artifacts", "extension");
const manifestPath = resolve(extensionDir, "manifest.json");

const IGNORED_BASENAMES = new Set([".DS_Store", "Thumbs.db"]);

function slugify(value) {
  return String(value || "extension")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function copyFileWithParents(srcFile, dstFile) {
  const parent = resolve(dstFile, "..");
  mkdirSync(parent, { recursive: true });
  const data = readFileSync(srcFile);
  writeFileSync(dstFile, data);
}

function listFilesRecursively(rootDir) {
  const files = [];

  function walk(currentDir) {
    const entries = readdirSync(currentDir, { withFileTypes: true })
      .filter((entry) => !IGNORED_BASENAMES.has(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name));

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

function sha256Hex(filePath) {
  const buffer = readFileSync(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}

function main() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const extensionNameSlug = slugify(manifest.name || "extension");
  const version = String(manifest.version || "0.0.0");
  const artifactDirName = `${extensionNameSlug}-v${version}`;
  const artifactDir = resolve(outputRoot, artifactDirName);
  const artifactExtensionDir = resolve(artifactDir, "extension");

  rmSync(artifactDir, { recursive: true, force: true });
  mkdirSync(artifactExtensionDir, { recursive: true });

  const sourceFiles = listFilesRecursively(extensionDir);
  for (const sourceFile of sourceFiles) {
    const rel = relative(extensionDir, sourceFile);
    const targetFile = resolve(artifactExtensionDir, rel);
    copyFileWithParents(sourceFile, targetFile);
  }

  const packagedFiles = listFilesRecursively(artifactExtensionDir).map((filePath) => {
    const rel = relative(artifactExtensionDir, filePath).replaceAll("\\", "/");
    return {
      path: rel,
      bytes: statSync(filePath).size,
      sha256: sha256Hex(filePath)
    };
  });

  writeFileSync(
    resolve(artifactDir, "artifact-manifest.json"),
    `${JSON.stringify(
      {
        extensionName: manifest.name,
        version,
        source: "extension/",
        createdBy: "scripts/package-extension.mjs",
        files: packagedFiles
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(`Extension package created: ${artifactDir}`);
  console.log(`Included files: ${packagedFiles.length}`);
  console.log("Load unpacked from:");
  console.log(artifactExtensionDir);
}

main();
