// Build-time changelog tool, bundled and run with esbuild (see package.json).
//
//   npm run changelog -- check            Validate CHANGELOG.md against manifest.json.
//   npm run changelog -- print <version>  Print one version's section (release notes).

import { readFileSync } from "node:fs";
import { parseChangelog } from "../src/changelog";

function fail(messages: string[]): never {
  for (const m of messages) console.error(`CHANGELOG.md: ${m}`);
  process.exit(1);
}

const [command, arg] = process.argv.slice(2);
const { entries, errors } = parseChangelog(readFileSync("CHANGELOG.md", "utf8"));

if (command === "check") {
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8")) as { version: string };
  if (!entries.some(e => e.version === manifest.version)) {
    errors.push(`No section for version ${manifest.version} (manifest.json).`);
  }
  if (errors.length) fail(errors);
  console.log(`CHANGELOG.md OK: ${entries.length} versions, current ${manifest.version}.`);
} else if (command === "print" && arg) {
  if (errors.length) fail(errors);
  const entry = entries.find(e => e.version === arg);
  if (!entry) fail([`No section for version ${arg}.`]);
  console.log(entry.body);
} else {
  fail(["Usage: changelog check | changelog print <version>"]);
}
