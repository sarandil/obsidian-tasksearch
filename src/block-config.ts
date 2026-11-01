// Parsing of the `task-search` block configuration – no Obsidian imports, so it can be
// unit-tested in Node. The YAML parser is passed in (Obsidian's `parseYaml` in the plugin).

import { parseStatuses, toText } from "./logic";

export interface BlockConfig {
  /** Text to look for in the note properties; empty means every note with tasks. */
  query: string;
  /** Properties to search in; empty means every property. */
  properties: string[];
  /** Folder paths without leading or trailing slashes. */
  folders: string[];
  /** Tag names without `#`. */
  tags: string[];
  /** Status ids selected when the block opens. */
  status: string[];
  /** Whether the note that contains the block is always part of the results, whatever the query, properties and source. */
  includeSelf: boolean;
}

export interface ParsedBlock {
  config: BlockConfig;
  /** Set when the block could not be read; the view shows it instead of results. */
  error?: string;
  /** True when the block is written in the pre-0.4.0 format and has to be converted to YAML. */
  legacy?: boolean;
}

export type YamlParser = (text: string) => unknown;

export function defaultConfig(): BlockConfig {
  return { query: "", properties: [], folders: [], tags: [], status: parseStatuses(), includeSelf: false };
}

export const LEGACY_FORMAT_ERROR =
  "This block uses the old configuration format. Since version 0.4.0 the block configuration is YAML: convert the block as shown in the 0.4.0 release notes.";

const EXAMPLE = "Write it as YAML, e.g. `query: client-x`.";

/** Thrown while reading the options; becomes the error shown in the view. */
class BlockError extends Error {
  constructor(
    message: string,
    readonly legacy = false,
  ) {
    super(message);
  }
}

/**
 * Reads a `task-search` block. The configuration is YAML; option names are case-insensitive.
 * Blocks in the pre-0.4.0 line-based format are not read: they get an error that asks
 * for the conversion to YAML (`legacy: true`).
 */
export function parseBlock(src: string, parseYaml: YamlParser): ParsedBlock {
  if (!hasContent(src)) return { config: defaultConfig() };
  try {
    return { config: readConfig(src, parseYaml) };
  } catch (e) {
    const legacy = e instanceof BlockError && e.legacy;
    const error = e instanceof BlockError ? e.message : `The block configuration couldn't be read. ${EXAMPLE}`;
    return legacy ? { config: defaultConfig(), error, legacy } : { config: defaultConfig(), error };
  }
}

function readConfig(src: string, parseYaml: YamlParser): BlockConfig {
  let parsed: unknown;
  try {
    parsed = parseYaml(src);
  } catch (e) {
    // Some old-format values aren't valid YAML (`properties: *`, `query: a: b`);
    // any other parse error is shown as it is.
    if (hasInvalidLegacyValue(src)) throw new BlockError(LEGACY_FORMAT_ERROR, true);
    throw new BlockError(yamlError(e, src));
  }
  if (!isPlainObject(parsed)) throw new BlockError(`The block configuration couldn't be read. ${EXAMPLE}`);

  // YAML silently drops `#…` after a space as a comment (`source: Work/, #client`,
  // `query: #client`), so these old-format values are recognised in the raw text.
  if (hasInlineSource(src) || hasUnquotedHash(src)) throw new BlockError(LEGACY_FORMAT_ERROR, true);

  const o = lowerKeys(parsed);
  return {
    query: readText(o["query"], "query", inlineValue(src, "query")),
    properties: readList(o["properties"], "properties"),
    ...readSource(o["source"]),
    status: parseStatuses(readList(o["status"], "status")),
    includeSelf: readBoolean(o["include-self"]),
  };
}

const KNOWN_KEYS = ["query", "properties", "source", "status", "include-self"];

/** Options that were comma-separated strings before 0.4.0. */
const LEGACY_LIST_KEYS = ["properties", "status"];

function hasContent(src: string): boolean {
  return src.split(/\r?\n/).some(l => l.trim() !== "" && !l.trim().startsWith("#"));
}

/**
 * The raw text after `key:` on the option's line, or `undefined` when the option has no line.
 * Option names are matched case-insensitively.
 */
function inlineValue(src: string, key: string): string | undefined {
  for (const line of src.split(/\r?\n/)) {
    const m = /^[ \t]*([^:#\s][^:]*?)[ \t]*:(.*)$/.exec(line);
    if (m && m[1].toLowerCase() === key) return m[2].trim();
  }
  return undefined;
}

/** Drops a trailing YAML comment (` # ...`) from a raw value. */
function stripComment(raw: string): string {
  return raw.replace(/(^|\s)#.*$/, "").trim();
}

/**
 * True if an option line holds an old-format value that isn't valid YAML:
 * `properties: *`, or an unquoted value with a second `:` (`query: a: b`).
 */
function hasInvalidLegacyValue(src: string): boolean {
  return KNOWN_KEYS.some(key => {
    const raw = inlineValue(src, key);
    if (raw === undefined) return false;
    const v = stripComment(raw);
    // Quoted values and flow lists or mappings are YAML, not the old format.
    if (/^["'{[]/.test(v)) return false;
    return v.startsWith("*") || /:(\s|$)/.test(v);
  });
}

/**
 * True if the `source:` line has an old-format inline value (`source: Work/, #client`).
 * A YAML comment, a flow mapping or list (`{ folders: [Work] }`) and `~` / `null` are not.
 */
function hasInlineSource(src: string): boolean {
  const v = inlineValue(src, "source");
  if (!v || /^#(\s|#|$)/.test(v)) return false;
  if (v.startsWith("#")) return true;
  if (/^[{[]/.test(v)) return false;
  return !/^(~|null)$/i.test(stripComment(v));
}

/** An option value that starts with `#name` (e.g. `query: #client`), which YAML reads as a comment. */
function hasUnquotedHash(src: string): boolean {
  return /^[ \t]*(?:query|properties|status|include-self)[ \t]*:[ \t]*#[^\s#]/im.test(src);
}

/** First line of the parser's message, plus a hint when the block is indented with tabs. */
function yamlError(e: unknown, src: string): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const detail = raw.split(/\r?\n/)[0].trim().replace(/:$/, "");
  let msg = "The block configuration isn't valid YAML" + (detail ? `: ${detail}.` : ".");
  if (/^[ ]*\t/m.test(src)) msg += " Indent with spaces, not tabs.";
  return msg;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Lowercases the option names; a name given twice in different case is an error. */
function lowerKeys(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    const key = k.toLowerCase().trim();
    if (key in out) throw new BlockError(`\`${key}\` is given more than once.`);
    out[key] = v;
  }
  return out;
}

function isScalar(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

/**
 * A single value as text. YAML turns `007` into 7 and `1.10` into 1.1, so numbers and
 * booleans are taken from the raw line (`raw`) as written.
 */
function readText(v: unknown, key: string, raw?: string): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (isScalar(v)) return (raw !== undefined && stripComment(raw)) || String(v).trim();
  throw new BlockError(`\`${key}\` must be a single value, e.g. \`${key}: client-x\`.`);
}

/**
 * A YAML list or a single value. For `properties` and `status`, a comma in a single value
 * is the old comma-separated format (`properties: project, client`).
 */
function readList(v: unknown, key: string): string[] {
  if (v == null) return [];
  if (Array.isArray(v) && v.every(x => isScalar(x) || x == null)) {
    return v.map(x => toText(x).trim()).filter(Boolean);
  }
  if (isScalar(v)) {
    const s = String(v).trim();
    if (LEGACY_LIST_KEYS.includes(key) && s.includes(",")) throw new BlockError(LEGACY_FORMAT_ERROR, true);
    return s ? [s] : [];
  }
  throw new BlockError(`\`${key}\` must be a list of values.`);
}

function readBoolean(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  return ["true", "yes", "on"].includes(toText(v).trim().toLowerCase());
}

/** `source` is a mapping with an optional `folders` and an optional `tags` list. */
function readSource(v: unknown): Pick<BlockConfig, "folders" | "tags"> {
  if (v == null) return { folders: [], tags: [] };
  if (!isPlainObject(v)) throw new BlockError("`source` must contain a `folders` and/or a `tags` list.");
  const o = lowerKeys(v);
  return {
    folders: readList(o["folders"], "folders").map(normalizeFolder).filter(f => f !== ""),
    tags: readList(o["tags"], "tags").map(normalizeTag).filter(Boolean),
  };
}

export function normalizeFolder(f: string): string {
  return f.trim().replace(/^\/+|\/+$/g, "");
}

export function normalizeTag(t: string): string {
  return t.trim().replace(/^#+/, "");
}
