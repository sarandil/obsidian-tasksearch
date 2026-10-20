// Run with: npm test
const { test } = require("node:test");
const assert = require("node:assert");
const L = require("../.test/logic.cjs");

test("parseConfig: case-insensitive keys, comments and quotes", () => {
  const c = L.parseConfig(
    `# comment\nQuery: client-x\nProperties: project, client\nSource: "Work/"\nstatus: Done\nno colon here`,
  );
  assert.deepStrictEqual(c, { query: "client-x", properties: "project, client", source: "Work/", status: "Done" });
  assert.deepStrictEqual(L.parseConfig("query: a: b"), { query: "a: b" });
});

test("splitList and parseStatuses", () => {
  assert.deepStrictEqual(L.splitList(" a, b ,, c "), ["a", "b", "c"]);
  assert.deepStrictEqual(L.parseStatuses("Done"), ["done"]);
  assert.deepStrictEqual(L.parseStatuses("question, todo"), ["todo", "question"]);
  assert.deepStrictEqual(L.parseStatuses("Other, DONE"), ["done", "other"]);
  assert.deepStrictEqual(L.parseStatuses("all"), ["todo", "done", "question", "important", "star", "other"]);
  assert.deepStrictEqual(L.parseStatuses("star, important"), ["important", "star"]);
  assert.deepStrictEqual(L.parseStatuses(undefined), ["todo"]);
  assert.deepStrictEqual(L.parseStatuses("nonsense"), ["todo"]);
});

test("toText flattens frontmatter values", () => {
  assert.strictEqual(L.toText(["a", 1, true]), "a, 1, true");
  assert.strictEqual(L.toText(null), "");
  assert.strictEqual(L.toText({ a: 1 }), '{"a":1}');
});

test("matchingProperty", () => {
  const fm = { Project: ["Client-X proposal", "Other"], count: 3 };
  assert.strictEqual(L.matchingProperty(fm, ["project"], "client-x"), "Project");
  assert.strictEqual(L.matchingProperty(fm, [], "client-x"), "Project");
  assert.strictEqual(L.matchingProperty(fm, ["*"], "3"), "count");
  assert.strictEqual(L.matchingProperty(fm, ["count"], "client-x"), undefined);
  assert.strictEqual(L.matchingProperty(fm, ["missing"], "client-x"), undefined);
});

test("noteMatchesQuery: empty query matches every note", () => {
  const fm = { project: "Client-X" };
  assert.ok(L.noteMatchesQuery(fm, [], ""));
  assert.ok(L.noteMatchesQuery({}, ["project"], ""));
  assert.ok(L.noteMatchesQuery(fm, ["project"], "client-x"));
  assert.ok(!L.noteMatchesQuery(fm, ["project"], "other"));
  assert.ok(!L.noteMatchesQuery({}, [], "client-x"));
});

test("task line parsing and status changes", () => {
  const cases = [
    ["- [ ] call them", "call them"],
    ["\t* [?] question [[Link]]", "question [[Link]]"],
    ["> - [x] quoted", "quoted"],
    ["1. [/] numbered", "numbered"],
    ["- [ ]", ""],
  ];
  for (const [line, text] of cases) assert.strictEqual(L.taskText(line), text, line);
  assert.strictEqual(L.taskText("- not a task"), null);
  assert.strictEqual(L.setTaskStatus("  - [ ] a [b] c", "x"), "  - [x] a [b] c");
  assert.strictEqual(L.setTaskStatus("> 2) [?] q", " "), "> 2) [ ] q");
  assert.strictEqual(L.setTaskStatus("plain", "x"), null);
  assert.strictEqual(L.toggleStatus(" "), "x");
  assert.strictEqual(L.toggleStatus("X"), " ");
  assert.strictEqual(L.toggleStatus("?"), "x");
});

test("status filters: every symbol belongs to exactly one status", () => {
  for (const ch of [" ", "x", "X", "?", "!", "*", "/", "-", ">", "<"]) {
    assert.strictEqual(L.STATUS_FILTERS.filter(f => f.test(ch)).length, 1, `symbol [${ch}]`);
  }
});

test("matchesStatuses: multi-select", () => {
  const sel = new Set(["todo", "question"]);
  assert.ok(L.matchesStatuses(" ", sel));
  assert.ok(L.matchesStatuses("?", sel));
  assert.ok(!L.matchesStatuses("x", sel));
  assert.ok(!L.matchesStatuses("/", sel));
  assert.ok(L.matchesStatuses("/", new Set(["other"])));
  assert.ok(L.matchesStatuses("!", new Set(["important"])));
  assert.ok(L.matchesStatuses("*", new Set(["star"])));
  assert.ok(!L.matchesStatuses("!", new Set(["other"])));
  assert.ok(!L.matchesStatuses("*", new Set(["other"])));
  assert.ok(!L.matchesStatuses(" ", new Set()));
});

test("inSource: folders OR, tags OR, groups AND", () => {
  assert.ok(L.inSource("Work/a.md", [], ["Work/"]));
  assert.ok(!L.inSource("Workshop/a.md", [], ["Work"]));
  assert.ok(L.inSource("x/a.md", ["#client/abc"], ["#client"]));
  assert.ok(!L.inSource("x/a.md", ["#client"], ["Work", "#client"]));
  assert.ok(L.inSource("x/a.md", [], []));
});
