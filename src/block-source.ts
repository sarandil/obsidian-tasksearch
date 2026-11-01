// Locating and rewriting a `task-search` block in the note text – no Obsidian imports,
// so it can be unit-tested in Node.

/** Opening fence of a `task-search` block, with an optional list or blockquote prefix. */
const OPEN_RE = /^([ \t]*(?:>[ \t]?)*)(`{3,}|~{3,})[ \t]*task-search\b/;

/**
 * Position of the block among the `task-search` blocks of the note (0 for the first one),
 * counted from the opening fence at `lineStart`. Used as a stable key for the block's UI state,
 * because it doesn't change when the block text or other text in the note is edited.
 */
export function blockIndex(text: string, lineStart: number): number {
  const lines = text.split("\n").slice(0, lineStart);
  return lines.filter(l => OPEN_RE.test(l.replace(/\r$/, ""))).length;
}

/** A change to the content lines of a block: lines `from` up to (not including) `to` become `lines`. */
export interface BlockEdit {
  from: number;
  to: number;
  lines: string[];
}

/**
 * The edit that replaces the content of the block whose fences are on `lineStart` and `lineEnd`.
 * Returns `null` when those lines aren't the block anymore, or when its content is no longer
 * `expectedSrc` (the note changed after the block was rendered).
 * The new lines keep the fence's blockquote or indentation prefix; they have no line endings.
 */
export function blockContentEdit(
  text: string,
  lineStart: number,
  lineEnd: number,
  expectedSrc: string,
  newContent: string,
): BlockEdit | null {
  const lines = text.split("\n").map(l => l.replace(/\r$/, ""));
  if (lineStart < 0 || lineEnd <= lineStart || lineEnd >= lines.length) return null;

  const open = OPEN_RE.exec(lines[lineStart]);
  if (!open) return null;
  const [, prefix, fence] = open;
  const close = removePrefix(lines[lineEnd], prefix).trim();
  if (!close.startsWith(fence[0].repeat(fence.length)) || close.replace(/[`~]/g, "") !== "") return null;

  const current = lines.slice(lineStart + 1, lineEnd).map(l => removePrefix(l, prefix));
  if (normalize(current.join("\n")) !== normalize(expectedSrc)) return null;

  const replacement = newContent === "" ? [] : newContent.split("\n").map(l => (prefix + l).trimEnd());
  return { from: lineStart + 1, to: lineEnd, lines: replacement };
}

/**
 * Applies `blockContentEdit` to the note text. Keeps the note's line endings.
 * Returns `null` when the edit can't be made.
 */
export function replaceBlockContent(
  text: string,
  lineStart: number,
  lineEnd: number,
  expectedSrc: string,
  newContent: string,
): string | null {
  const edit = blockContentEdit(text, lineStart, lineEnd, expectedSrc, newContent);
  if (!edit) return null;
  const lines = text.split("\n");
  const cr = lines[lineStart].endsWith("\r") ? "\r" : "";
  lines.splice(edit.from, edit.to - edit.from, ...edit.lines.map(l => l + cr));
  return lines.join("\n");
}

/** Removes the fence prefix (blockquote markers, indentation) from a content line. */
function removePrefix(line: string, prefix: string): string {
  if (line.startsWith(prefix)) return line.slice(prefix.length);
  const bare = prefix.trimEnd();
  return line.startsWith(bare) ? line.slice(bare.length) : line;
}

/** Ignores trailing whitespace and trailing empty lines when comparing block content. */
function normalize(s: string): string {
  return s
    .replace(/\r/g, "")
    .split("\n")
    .map(l => l.trimEnd())
    .join("\n")
    .trimEnd();
}
