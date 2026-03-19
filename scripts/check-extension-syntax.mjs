import { spawnSync } from "node:child_process";
import path from "node:path";

const files = [
  "extension/background.js",
  "extension/content-script.js",
  "extension/inspector.js",
  "extension/ui-floating-control/dock.js",
  "extension/ui-record-popup/popup.js"
];

let hasError = false;

for (const relativeFile of files) {
  const target = path.resolve(process.cwd(), relativeFile);
  const result = spawnSync(process.execPath, ["--check", target], {
    stdio: "pipe",
    encoding: "utf8"
  });

  if (result.status !== 0) {
    hasError = true;
    process.stderr.write(`syntax-check: failed ${relativeFile}\n`);
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
  } else {
    process.stdout.write(`syntax-check: ok ${relativeFile}\n`);
  }
}

if (hasError) {
  process.exit(1);
}
