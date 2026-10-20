// Pure helpers – no Obsidian imports, so they can be unit-tested in Node.

export type Config = Record<string, string>;

/** Lowercase, trimmed config key. */
function normalizeKey(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Parses the body of a `task-search` code block:
 *   key: value
 *   # comment line
 * Keys are case-insensitive. Surrounding quotes around a value are removed.
 */
export function parseConfig(src: string): Config {
  const cfg: Config = {};
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = normalizeKey(line.slice(0, i));
    let value = line.slice(i + 1).trim();
    if (value.length >= 2 && /^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    cfg[key] = value;
  }
  return cfg;
}

/** "a, b ,c" → ["a","b","c"] */
export function splitList(s?: string): string[] {
  return (s ?? "").split(",").map(x => x.trim()).filter(Boolean);
}

/** Flattens a frontmatter value to searchable text. */
export function toText(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(toText).join(", ");
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return v.toString();
  return JSON.stringify(v) ?? "";
}

/** Case-insensitive frontmatter key lookup. Returns the key as written in the note. */
function fmKey(fm: Record<string, unknown>, key: string): string | undefined {
  if (key in fm) return key;
  return Object.keys(fm).find(x => x.toLowerCase() === key.toLowerCase());
}

export function fmGet(fm: Record<string, unknown>, key: string): unknown {
  const k = fmKey(fm, key);
  return k === undefined ? undefined : fm[k];
}

/** Property list from config: empty or "*" means every property of the note. */
function resolveProperties(fm: Record<string, unknown>, props: string[]): string[] {
  if (!props.length || props.includes("*")) return Object.keys(fm);
  return props.map(p => fmKey(fm, p)).filter((k): k is string => k !== undefined);
}

/**
 * True if the note should be part of the results: always when there is no query,
 * otherwise when one of the selected properties contains `needle` (already lowercased).
 */
export function noteMatchesQuery(fm: Record<string, unknown>, props: string[], needle: string): boolean {
  return !needle || matchingProperty(fm, props, needle) !== undefined;
}

/** Returns the first property whose value contains `needle` (already lowercased). */
export function matchingProperty(
  fm: Record<string, unknown>,
  props: string[],
  needle: string,
): string | undefined {
  return resolveProperties(fm, props).find(k => toText(fm[k]).toLowerCase().includes(needle));
}

// ----- Tasks -----

/** prefix | status char | "]" + optional space | text */
const TASK_RE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)(.)(\]\s?)(.*)$/;

export function taskText(line: string): string | null {
  const m = line.match(TASK_RE);
  return m ? m[4] : null;
}

export function setTaskStatus(line: string, ch: string): string | null {
  if (!TASK_RE.test(line)) return null;
  return line.replace(TASK_RE, (_m, a: string, _s: string, c: string, rest: string) => a + ch + c + rest);
}

/** Next status when the checkbox is clicked. */
export function toggleStatus(ch: string): string {
  return ch === " " ? "x" : ch === "x" || ch === "X" ? " " : "x";
}

interface StatusFilter {
  id: string;
  label: string;
  /** Checkbox symbol(s) shown next to the label. */
  symbol: string;
  /** Tooltip explaining which checkbox symbols belong to this status. */
  hint: string;
  test: (ch: string) => boolean;
}

/** The statuses offered in the status dropdown. Every task belongs to exactly one of them. */
/** Status symbols that have their own filter; everything else falls under "Other". */
const NAMED_SYMBOLS = [" ", "x", "X", "?", "!", "*"];

export const STATUS_FILTERS: StatusFilter[] = [
  { id: "todo", label: "To do", symbol: "[ ]", hint: "Tasks marked [ ]", test: c => c === " " },
  { id: "done", label: "Done", symbol: "[x]", hint: "Tasks marked [x]", test: c => c === "x" || c === "X" },
  { id: "question", label: "Question", symbol: "[?]", hint: "Tasks marked [?]", test: c => c === "?" },
  { id: "important", label: "Important", symbol: "[!]", hint: "Tasks marked [!]", test: c => c === "!" },
  { id: "star", label: "Star", symbol: "[*]", hint: "Tasks marked [*]", test: c => c === "*" },
  {
    id: "other",
    label: "Other",
    symbol: "[/] [-] …",
    hint: "Tasks with any other symbol, e.g. [/] or [-]",
    test: c => !NAMED_SYMBOLS.includes(c),
  },
];

/** Statuses offered in the task context menu. */
export const STATUS_CHOICES: [string, string][] = [
  [" ", "To do [ ]"],
  ["/", "In progress [/]"],
  ["?", "Question [?]"],
  ["!", "Important [!]"],
  ["*", "Star [*]"],
  ["x", "Done [x]"],
  ["-", "Cancelled [-]"],
];

const DEFAULT_STATUSES = ["todo"];

/**
 * Parses the `status` option into the statuses selected when the block opens.
 * Accepts a comma-separated list (`todo, question`) or `all`; unknown values are ignored.
 * Falls back to `todo` when nothing valid is given.
 */
export function parseStatuses(s?: string): string[] {
  const parts = splitList(s).map(normalizeKey);
  if (parts.includes("all")) return STATUS_FILTERS.map(f => f.id);
  const ids = STATUS_FILTERS.map(f => f.id).filter(id => parts.includes(id));
  return ids.length ? ids : [...DEFAULT_STATUSES];
}

/** True if the task's status symbol belongs to any of the selected statuses. */
export function matchesStatuses(ch: string, selected: ReadonlySet<string>): boolean {
  return STATUS_FILTERS.some(f => selected.has(f.id) && f.test(ch));
}

// ----- Sources -----

/** `source: Work/, Projects, #client` → folders OR'd, tags OR'd, the two groups AND'd. */
export function inSource(path: string, fileTags: string[], sources: string[]): boolean {
  if (!sources.length) return true;
  const folders = sources.filter(s => !s.startsWith("#")).map(s => s.replace(/^\/+|\/+$/g, ""));
  const tags = sources.filter(s => s.startsWith("#")).map(s => s.toLowerCase());
  const ft = fileTags.map(t => t.toLowerCase());
  const okFolder = !folders.length || folders.some(f => f === "" || path === f || path.startsWith(f + "/"));
  const okTag = !tags.length || tags.some(t => ft.some(x => x === t || x.startsWith(t + "/")));
  return okFolder && okTag;
}
