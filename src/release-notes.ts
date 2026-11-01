import { App, Component, MarkdownRenderer, Modal, TFile } from "obsidian";
import changelogText from "../CHANGELOG.md";
import { ChangelogEntry, entriesBetween, parseChangelog, renderReleaseNotes } from "./changelog";

const BLOCK_RE = /^\s*(```+|~~~+)\s*task-search\b/m;

/** All changelog entries bundled into the plugin (validated at build time). */
export const CHANGELOG: ChangelogEntry[] = parseChangelog(changelogText).entries;

export class ReleaseNotesModal extends Modal {
  private component = new Component();

  constructor(
    app: App,
    private heading: string,
    private entries: ChangelogEntry[],
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("tsearch-release-notes");
    this.setTitle(this.heading);
    this.component.load();
    const body = this.contentEl.createDiv({ cls: "tsearch-release-notes-body markdown-rendered" });
    void MarkdownRenderer.render(this.app, renderReleaseNotes(this.entries), body, "", this.component);
  }

  onClose(): void {
    this.component.unload();
    this.contentEl.empty();
  }
}

/** Entries to show after updating from `since` to `current`. */
export function entriesForUpdate(since: string, current: string): ChangelogEntry[] {
  return entriesBetween(CHANGELOG, since, current);
}

/** All entries up to the running version, for the "Show release notes" command. */
export function allEntries(current: string): ChangelogEntry[] {
  return entriesBetween(CHANGELOG, null, current);
}

/** True if any note contains a `task-search` block. Stops at the first match. */
export async function vaultHasTaskSearchBlock(app: App): Promise<boolean> {
  for (const file of app.vault.getMarkdownFiles()) {
    if (!mayContainCodeBlock(app, file)) continue;
    if (BLOCK_RE.test(await app.vault.cachedRead(file))) return true;
  }
  return false;
}

/** Uses the metadata cache to skip notes without any code block. */
function mayContainCodeBlock(app: App, file: TFile): boolean {
  const sections = app.metadataCache.getFileCache(file)?.sections;
  return sections === undefined || sections.some(s => s.type === "code");
}
