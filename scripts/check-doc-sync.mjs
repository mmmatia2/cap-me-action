#!/usr/bin/env node

import { execFileSync } from "node:child_process";

function runGit(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function parseArgs(argv) {
  const parsed = { base: "", head: "", staged: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base" && argv[i + 1]) {
      parsed.base = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--head" && argv[i + 1]) {
      parsed.head = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--staged") {
      parsed.staged = true;
    }
  }
  return parsed;
}

function normalize(filePath) {
  return String(filePath).replaceAll("\\", "/").trim();
}

function getChangedFiles(options) {
  let out = "";

  if (options.base && options.head) {
    out = runGit(["diff", "--name-only", `${options.base}...${options.head}`]);
  } else if (options.base) {
    out = runGit(["diff", "--name-only", `${options.base}...HEAD`]);
  } else if (options.staged) {
    out = runGit(["diff", "--name-only", "--cached"]);
  } else {
    out = runGit(["diff", "--name-only", "HEAD"]);
  }

  return out
    .split(/\r?\n/)
    .map(normalize)
    .filter(Boolean);
}

function startsWithAny(value, prefixes) {
  return prefixes.some((prefix) => value === prefix || value.startsWith(prefix));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = getChangedFiles(options);

  if (files.length === 0) {
    console.log("docs-sync: no changed files found.");
    return;
  }

  const criticalPrefixes = [
    "app/src/",
    "extension/",
    "app/package.json",
    "package.json",
    "pnpm-lock.yaml"
  ];
  const docsPrefixes = [
    "docs/",
    "README.md",
    ".github/pull_request_template.md"
  ];

  const criticalChanges = files.filter((f) => startsWithAny(f, criticalPrefixes));
  if (criticalChanges.length === 0) {
    console.log("docs-sync: no critical code changes; no docs update required.");
    return;
  }

  const docChanges = files.filter((f) => startsWithAny(f, docsPrefixes));
  if (docChanges.length > 0) {
    console.log("docs-sync: passed.");
    console.log(`critical changes: ${criticalChanges.length}`);
    console.log(`doc changes: ${docChanges.length}`);
    return;
  }

  if (process.env.DOC_SYNC_ALLOW_NO_DOCS === "1") {
    console.warn("docs-sync: bypass enabled via DOC_SYNC_ALLOW_NO_DOCS=1");
    return;
  }

  console.error("docs-sync: failed. Critical code changes detected without doc updates.");
  console.error("Update at least one of:");
  console.error("- docs/STATE.md");
  console.error("- docs/CHANGELOG.md");
  console.error("- docs/adr/*.md");
  console.error("");
  console.error("Critical changed files:");
  for (const file of criticalChanges) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

main();
