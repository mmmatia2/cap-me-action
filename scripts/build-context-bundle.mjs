#!/usr/bin/env node

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT_PATH = join(ROOT, "docs", "context-bundle.md");

const fixedFiles = [
  "docs/README.md",
  "docs/STATE.md",
  "docs/CONTEXT_MESH_LIGHT.md",
  "docs/CHANGELOG.md",
  "docs/team-library-protocol.md"
];

function readSafe(path) {
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, "utf8");
}

function listAdrFiles() {
  const dir = join(ROOT, "docs", "adr");
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md") && name !== "README.md" && name !== "0000-template.md")
    .sort()
    .map((name) => `docs/adr/${name}`);
}

function sectionForFile(relPath) {
  const fullPath = join(ROOT, relPath);
  const content = readSafe(fullPath);
  if (content == null) {
    return `## ${relPath}\n\n_Missing file_\n`;
  }
  return `## ${relPath}\n\n\`\`\`md\n${content.trim()}\n\`\`\`\n`;
}

function main() {
  const files = [...fixedFiles, ...listAdrFiles()];
  const generatedAt = new Date().toISOString();

  const header = [
    "# Context Bundle",
    "",
    `Generated at: ${generatedAt}`,
    "",
    "This file is generated. It includes the active documentation bundle only.",
    "Source of truth remains the individual active docs under `docs/`.",
    ""
  ].join("\n");

  const body = files.map(sectionForFile).join("\n");
  const next = `${header}\n${body}`;

  mkdirSync(join(ROOT, "docs"), { recursive: true });
  writeFileSync(OUT_PATH, next, "utf8");
  console.log(`Wrote ${OUT_PATH}`);
}

main();
