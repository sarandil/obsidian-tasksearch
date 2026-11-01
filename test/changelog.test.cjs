// Run with: npm test
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../.test/changelog.cjs");

const SAMPLE = `# Changelog

Intro text is ignored.

## 0.10.0

### Added
- Ten.

### Migration
Change this:

    query: old

\`\`\`yaml
## not a heading
### also not a heading
\`\`\`

## 0.9.0

### Fixed
- Nine.

## 0.3.0

### Added
- First public version.
`;

test("compareVersions compares numerically", () => {
  assert.ok(C.compareVersions("0.10.0", "0.9.0") > 0);
  assert.ok(C.compareVersions("1.0.0", "0.99.99") > 0);
  assert.ok(C.compareVersions("0.3.0", "0.4.0") < 0);
  assert.strictEqual(C.compareVersions("2.1.3", "2.1.3"), 0);
});

test("parseChangelog splits sections and ignores headings in code fences", () => {
  const { entries, errors } = C.parseChangelog(SAMPLE);
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(entries.map(e => e.version), ["0.10.0", "0.9.0", "0.3.0"]);
  assert.ok(entries[0].hasMigration);
  assert.ok(!entries[1].hasMigration);
  assert.ok(entries[0].body.includes("## not a heading"));
  assert.ok(entries[0].body.startsWith("### Added"));
});

test("parseChangelog reports invalid, duplicate, unordered versions and unknown subsections", () => {
  const bad = `## 1.0\n\n## 0.2.0\n### Added\n\n## 0.2.0\n\n## 0.5.0\n### Notes\n`;
  const { errors } = C.parseChangelog(bad);
  assert.ok(errors.some(e => e.includes('"1.0" is not a valid')), errors.join("\n"));
  assert.ok(errors.some(e => e.includes("0.2.0 appears more than once")), errors.join("\n"));
  assert.ok(errors.some(e => e.includes("descending order")), errors.join("\n"));
  assert.ok(errors.some(e => e.includes('unknown subsection "Notes"')), errors.join("\n"));
  // A duplicate is reported once, not also as an ordering error.
  assert.strictEqual(C.parseChangelog("## 0.2.0\n\n## 0.2.0\n").errors.length, 1);
});

test("entriesBetween selects versions after the last seen one, up to the running one", () => {
  const { entries } = C.parseChangelog(SAMPLE);
  const pick = (after, upTo) => C.entriesBetween(entries, after, upTo).map(e => e.version);
  assert.deepStrictEqual(pick("0.3.0", "0.10.0"), ["0.10.0", "0.9.0"]);
  assert.deepStrictEqual(pick("0.9.0", "0.10.0"), ["0.10.0"]);
  assert.deepStrictEqual(pick("0.3.0", "0.9.0"), ["0.9.0"]);
  assert.deepStrictEqual(pick("0.10.0", "0.10.0"), []);
  assert.deepStrictEqual(pick(null, "0.9.0"), ["0.9.0", "0.3.0"]);
});

test("highlightMigration turns the Migration subsection into a callout", () => {
  const body = "### Added\n- New.\n\n### Migration\nDo this:\n\n    query: x\n\n### Fixed\n- Bug.";
  assert.strictEqual(
    C.highlightMigration(body),
    "### Added\n- New.\n\n> [!warning] Migration\n> Do this:\n>\n>     query: x\n>\n### Fixed\n- Bug.",
  );
});

test("renderReleaseNotes adds a heading per version", () => {
  const md = C.renderReleaseNotes([{ version: "1.2.0", body: "### Added\n- A.", hasMigration: false }]);
  assert.strictEqual(md, "## 1.2.0\n\n### Added\n- A.");
});

test("the repository's CHANGELOG.md is valid", () => {
  const text = fs.readFileSync(path.join(__dirname, "..", "CHANGELOG.md"), "utf8");
  const { entries, errors } = C.parseChangelog(text);
  assert.deepStrictEqual(errors, []);
  assert.ok(entries.some(e => e.version === "0.3.0"));
});

test("checkForUpdate: updates, fresh installs and updates from 0.3.0", async () => {
  const never = async () => { throw new Error("hasBlocks must not be called"); };
  const yes = async () => true;
  const no = async () => false;
  assert.deepStrictEqual(await C.checkForUpdate("0.5.0", "0.4.0", never), { showSince: "0.4.0" });
  assert.deepStrictEqual(await C.checkForUpdate("0.4.0", "0.4.0", never), { showSince: null });
  assert.deepStrictEqual(await C.checkForUpdate("0.4.0", "0.5.0", never), { showSince: null });
  assert.deepStrictEqual(await C.checkForUpdate("0.4.0", undefined, yes), { showSince: "0.3.0" });
  assert.deepStrictEqual(await C.checkForUpdate("0.4.0", undefined, no), { showSince: null });
});
