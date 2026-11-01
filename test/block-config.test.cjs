// Run with: npm test
const { test } = require("node:test");
const assert = require("node:assert");
const YAML = require("yaml");
const B = require("../.test/block-config.cjs");

const parse = src => B.parseBlock(src, text => YAML.parse(text));
const cfg = src => {
  const r = parse(src);
  assert.strictEqual(r.error, undefined, `unexpected error for:\n${src}`);
  return r.config;
};
const assertLegacy = src => {
  const r = parse(src);
  assert.strictEqual(r.legacy, true, `expected the old-format error for:\n${src}`);
  assert.strictEqual(r.error, B.LEGACY_FORMAT_ERROR);
  assert.deepStrictEqual(r.config, DEFAULTS);
};
const assertError = (src, re) => {
  const r = parse(src);
  assert.strictEqual(r.legacy, undefined, `unexpected old-format error for:\n${src}`);
  assert.match(r.error ?? "", re);
  assert.deepStrictEqual(r.config, DEFAULTS);
};

const DEFAULTS = { query: "", properties: [], folders: [], tags: [], status: ["todo"], includeSelf: false };

test("empty and comment-only blocks use the defaults", () => {
  assert.deepStrictEqual(cfg(""), DEFAULTS);
  assert.deepStrictEqual(cfg("\n  \n"), DEFAULTS);
  assert.deepStrictEqual(cfg("# just a comment\n"), DEFAULTS);
});

test("YAML format", () => {
  const src = [
    "query: client-x",
    "properties:",
    "  - project",
    "  - client",
    "source:",
    "  folders:",
    "    - Work",
    "  tags:",
    "    - client",
    "status:",
    "  - todo",
    "  - question",
    "include-self: true",
  ].join("\n");
  assert.deepStrictEqual(cfg(src), {
    query: "client-x",
    properties: ["project", "client"],
    folders: ["Work"],
    tags: ["client"],
    status: ["todo", "question"],
    includeSelf: true,
  });
});

test("flow lists and single values", () => {
  const c = cfg("query: x\nproperties: project\nstatus: [todo, question]\nsource:\n  tags: [client, team]");
  assert.deepStrictEqual(c.properties, ["project"]);
  assert.deepStrictEqual(c.status, ["todo", "question"]);
  assert.deepStrictEqual(c.tags, ["client", "team"]);
});

test("old blocks that are also valid YAML keep working", () => {
  const c = cfg("query: client-x\nproperties: project\nstatus: done");
  assert.strictEqual(c.query, "client-x");
  assert.deepStrictEqual(c.properties, ["project"]);
  assert.deepStrictEqual(c.status, ["done"]);
});

test("old-format blocks ask for the conversion to YAML", () => {
  assertLegacy("query: client-x\nproperties: project, client");
  assertLegacy("query: x\nstatus: todo, question");
  assertLegacy("query: x\nsource: Work/, #client");
  assertLegacy("source: #client");
  assertLegacy("source: Work/");
  assertLegacy("query: x\nproperties: *");
  assertLegacy("query: a: b");
  assertLegacy("query: #client");
});

test("source as a YAML flow mapping", () => {
  const c = cfg("source: { folders: [Work], tags: [client] }");
  assert.deepStrictEqual(c.folders, ["Work"]);
  assert.deepStrictEqual(c.tags, ["client"]);
});

test('a quoted "#client" query is read as text', () => {
  assert.strictEqual(cfg('query: "#client"').query, "#client");
});

test("a YAML comment after source: is not the old inline source", () => {
  assert.deepStrictEqual(cfg("source: # where to look\n  folders:\n    - Work").folders, ["Work"]);
});

test("option names are case-insensitive", () => {
  const c = cfg("Query: x\nPROPERTIES:\n  - project\nInclude-Self: true\nStatus: done");
  assert.strictEqual(c.query, "x");
  assert.deepStrictEqual(c.properties, ["project"]);
  assert.strictEqual(c.includeSelf, true);
  assert.deepStrictEqual(c.status, ["done"]);
});

test("status: all and unknown values", () => {
  assert.deepStrictEqual(cfg("status: all").status, ["todo", "done", "question", "important", "star", "other"]);
  assert.deepStrictEqual(cfg("status: nonsense").status, ["todo"]);
});

test('properties: "*" means every property', () => {
  assert.deepStrictEqual(cfg('properties: "*"').properties, ["*"]);
});

test("tags and folders are normalised; commas in folder names are allowed", () => {
  const c = cfg('source:\n  folders:\n    - /Work/\n    - Projects/Sub\n    - "Notes, misc"\n  tags:\n    - "#client"\n    - team');
  assert.deepStrictEqual(c.folders, ["Work", "Projects/Sub", "Notes, misc"]);
  assert.deepStrictEqual(c.tags, ["client", "team"]);
});

test("include-self accepts YAML booleans and yes/true strings", () => {
  assert.strictEqual(cfg("include-self: yes").includeSelf, true);
  assert.strictEqual(cfg("include-self: false").includeSelf, false);
  assert.strictEqual(cfg("query: x").includeSelf, false);
});

test("numbers in query are read as text", () => {
  assert.strictEqual(cfg("query: 2026").query, "2026");
});

test("wrong value types report an error", () => {
  assertError("query: [x]", /`query` must be a single value/);
  assertError("properties:\n  name: x", /`properties` must be a list/);
  assertError("source:\n  - Work", /`source` must contain a `folders` and\/or a `tags` list/);
});

test("text that isn't a configuration reports an error", () => {
  assertError("just some text without options", /couldn't be read/);
});

test("a tab-indented YAML block reports the YAML error", () => {
  const r = parse('query: "afc.architecture"\nproperties:\n\t- timesheet-work\n\t- parent-note\ninclude-self: true');
  assert.strictEqual(r.legacy, undefined);
  assert.match(r.error, /isn't valid YAML/);
  assert.match(r.error, /Indent with spaces, not tabs\./);
  assert.deepStrictEqual(r.config, DEFAULTS);
});

test("an invalid YAML block with list items reports the error without the tab hint", () => {
  assertError("query: x\nproperties:\n- a\n  - b: [", /isn't valid YAML/);
  assert.doesNotMatch(parse("query: x\nproperties:\n- a\n  - b: [").error, /tabs/);
});

test("numbers and booleans in query keep the text as written", () => {
  assert.strictEqual(cfg("query: 007").query, "007");
  assert.strictEqual(cfg("query: 1.10").query, "1.10");
  assert.strictEqual(cfg("query: 1.10 # version").query, "1.10");
  assert.strictEqual(cfg("Query: true").query, "true");
  assert.strictEqual(cfg("query: 2026-01-01").query, "2026-01-01");
});

test("YAML errors in flat blocks are shown as YAML errors, not as the old format", () => {
  assertError("query: a\nquery: b", /isn't valid YAML/);
  assertError("query: x\nstatus: [todo,", /isn't valid YAML/);
  assertError('query: "a: b"\nquery: c', /isn't valid YAML/);
  assertError("source: { folders: [Work] }\nquery: a\nquery: b", /isn't valid YAML/);
});

test("source: empty values and flow lists", () => {
  assert.deepStrictEqual(cfg("source: ~"), DEFAULTS);
  assert.deepStrictEqual(cfg("source: null # nothing"), DEFAULTS);
  assertError("source: [Work]", /`source` must contain a `folders` and\/or a `tags` list/);
});

test("an option given twice in different case is an error", () => {
  assertError("Query: a\nquery: b", /`query` is given more than once/);
  assertError("source:\n  Folders:\n    - A\n  folders:\n    - B", /`folders` is given more than once/);
});
