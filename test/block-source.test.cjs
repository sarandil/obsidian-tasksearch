// Run with: npm test
const { test } = require("node:test");
const assert = require("node:assert");
const S = require("../.test/block-source.cjs");

const note = ["# Note", "", "```task-search", "query: x", "status: done", "```", "", "- [ ] task", ""].join("\n");

test("replaceBlockContent replaces only the block content", () => {
  const out = S.replaceBlockContent(note, 2, 5, "query: x\nstatus: done", "query: y");
  assert.strictEqual(out, ["# Note", "", "```task-search", "query: y", "```", "", "- [ ] task", ""].join("\n"));
});

test("replaceBlockContent writes an empty block", () => {
  const out = S.replaceBlockContent(note, 2, 5, "query: x\nstatus: done\n", "");
  assert.strictEqual(out, ["# Note", "", "```task-search", "```", "", "- [ ] task", ""].join("\n"));
});

test("replaceBlockContent refuses when the block changed or the lines moved", () => {
  assert.strictEqual(S.replaceBlockContent(note, 2, 5, "query: other", "query: y"), null);
  assert.strictEqual(S.replaceBlockContent(note, 1, 5, "query: x\nstatus: done", "query: y"), null);
  assert.strictEqual(S.replaceBlockContent(note, 2, 4, "query: x", "query: y"), null);
  assert.strictEqual(S.replaceBlockContent(note, 2, 50, "query: x", "query: y"), null);
});

test("replaceBlockContent keeps CRLF line endings", () => {
  const crlf = note.replace(/\n/g, "\r\n");
  const out = S.replaceBlockContent(crlf, 2, 5, "query: x\nstatus: done", "query: y\nstatus: all");
  assert.strictEqual(out, ["# Note", "", "```task-search", "query: y", "status: all", "```", "", "- [ ] task", ""].join("\r\n"));
});

test("replaceBlockContent keeps the blockquote and list indentation prefix", () => {
  const quoted = ["> ```task-search", "> query: x", ">", "> ```"].join("\n");
  assert.strictEqual(
    S.replaceBlockContent(quoted, 0, 3, "query: x\n", "query: y\nproperties:\n  - a"),
    ["> ```task-search", "> query: y", "> properties:", ">   - a", "> ```"].join("\n"),
  );
  const listed = ["- item", "  ~~~~task-search", "  query: x", "  ~~~~"].join("\n");
  assert.strictEqual(
    S.replaceBlockContent(listed, 1, 3, "query: x", "query: y"),
    ["- item", "  ~~~~task-search", "  query: y", "  ~~~~"].join("\n"),
  );
});

test("blockIndex counts the task-search blocks above the line", () => {
  const text = ["```task-search", "```", "```js", "```", "> ```task-search", "> ```", "```task-search", "```"].join("\n");
  assert.strictEqual(S.blockIndex(text, 0), 0);
  assert.strictEqual(S.blockIndex(text, 4), 1);
  assert.strictEqual(S.blockIndex(text, 6), 2);
});

test("blockContentEdit returns the content lines to replace", () => {
  assert.deepStrictEqual(S.blockContentEdit(note, 2, 5, "query: x\nstatus: done", "query: y\nstatus: all"), {
    from: 3,
    to: 5,
    lines: ["query: y", "status: all"],
  });
  assert.deepStrictEqual(S.blockContentEdit(note, 2, 5, "query: x\nstatus: done", ""), { from: 3, to: 5, lines: [] });
  assert.strictEqual(S.blockContentEdit(note, 2, 5, "query: changed", "query: y"), null);
});
