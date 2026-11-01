// Changelog parsing and selection – no Obsidian imports, so it can be unit-tested in Node
// and reused by the build script (scripts/changelog.ts).

export interface ChangelogEntry {
  version: string;
  /** Markdown body of the section, without the `## <version>` heading. */
  body: string;
  hasMigration: boolean;
}

export interface ParsedChangelog {
  entries: ChangelogEntry[];
  errors: string[];
}

export const ALLOWED_SUBSECTIONS = ["Added", "Changed", "Fixed", "Removed", "Migration"];

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const FENCE_RE = /^\s*(```|~~~)/;

export function isValidVersion(v: string): boolean {
  return SEMVER_RE.test(v);
}

/** Compares two x.y.z versions numerically: negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Splits CHANGELOG.md into one entry per `## <version>` section and validates it.
 * Text before the first section (title, intro) is ignored. Headings inside fenced
 * code blocks are not treated as headings.
 */
export function parseChangelog(text: string): ParsedChangelog {
  const entries: ChangelogEntry[] = [];
  const errors: string[] = [];
  let current: { version: string; lines: string[] } | null = null;
  let inFence = false;

  const finish = () => {
    if (!current) return;
    const body = current.lines.join("\n").trim();
    entries.push({ version: current.version, body, hasMigration: /^### Migration\s*$/m.test(body) });
  };

  text.split(/\r?\n/).forEach((line, i) => {
    if (FENCE_RE.test(line)) inFence = !inFence;
    const h2 = !inFence && /^## (.+?)\s*$/.exec(line);
    if (h2) {
      finish();
      const version = h2[1];
      if (!isValidVersion(version)) errors.push(`Line ${i + 1}: "${version}" is not a valid x.y.z version.`);
      current = { version, lines: [] };
      return;
    }
    const h3 = !inFence && /^### (.+?)\s*$/.exec(line);
    if (h3 && current && !ALLOWED_SUBSECTIONS.includes(h3[1])) {
      errors.push(
        `Line ${i + 1}: unknown subsection "${h3[1]}" in ${current.version}. ` +
          `Use one of: ${ALLOWED_SUBSECTIONS.join(", ")}.`,
      );
    }
    current?.lines.push(line);
  });
  finish();

  const seen = new Set<string>();
  entries.forEach((e, i) => {
    if (seen.has(e.version)) errors.push(`Version ${e.version} appears more than once.`);
    seen.add(e.version);
    const prev = entries[i - 1];
    if (prev && isValidVersion(prev.version) && isValidVersion(e.version) && compareVersions(prev.version, e.version) < 0) {
      errors.push(`Versions must be in descending order: ${prev.version} is followed by ${e.version}.`);
    }
  });

  return { entries, errors };
}

/**
 * Entries newer than `after` (exclusive) and not newer than `upTo` (inclusive), newest first.
 * `after` null means "from the beginning".
 */
export function entriesBetween(entries: ChangelogEntry[], after: string | null, upTo: string): ChangelogEntry[] {
  return entries.filter(
    e =>
      isValidVersion(e.version) &&
      compareVersions(e.version, upTo) <= 0 &&
      (after === null || compareVersions(e.version, after) > 0),
  );
}

/** Turns every `### Migration` subsection into an Obsidian callout so it stands out. */
export function highlightMigration(body: string): string {
  const out: string[] = [];
  let inMigration = false;
  let inFence = false;
  for (const line of body.split("\n")) {
    const isFence = FENCE_RE.test(line);
    const heading = !inFence && /^### (.+?)\s*$/.exec(line);
    if (heading) {
      inMigration = heading[1] === "Migration";
      out.push(inMigration ? "> [!warning] Migration" : line);
    } else if (inMigration) {
      out.push(line.trim() === "" ? ">" : `> ${line}`);
    } else {
      out.push(line);
    }
    if (isFence) inFence = !inFence;
  }
  return out.join("\n");
}

/** Markdown for the release notes window: one `## <version>` section per entry. */
export function renderReleaseNotes(entries: ChangelogEntry[]): string {
  return entries.map(e => `## ${e.version}\n\n${highlightMigration(e.body)}`).join("\n\n");
}

/** The last release that did not record `lastSeenVersion`. */
export const LAST_VERSION_WITHOUT_RELEASE_NOTES = "0.3.0";

export interface UpdateCheck {
  /** Show the window for versions newer than this; null means nothing to show. */
  showSince: string | null;
}

/**
 * Decides whether the "What's new" window should open on this start.
 * `hasBlocks` is only called when no version has been recorded yet.
 */
export async function checkForUpdate(
  current: string,
  lastSeen: string | undefined,
  hasBlocks: () => Promise<boolean>,
): Promise<UpdateCheck> {
  if (lastSeen) {
    return { showSince: compareVersions(current, lastSeen) > 0 ? lastSeen : null };
  }
  // No version recorded: either a fresh install or an update from 0.3.0, which did not store it.
  return { showSince: (await hasBlocks()) ? LAST_VERSION_WITHOUT_RELEASE_NOTES : null };
}
