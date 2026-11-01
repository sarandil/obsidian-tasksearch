import { Plugin, parseYaml } from "obsidian";
import { BlockConfig, parseBlock } from "./block-config";
import { blockIndex } from "./block-source";
import { BlockWriter } from "./block-writer";
import { checkForUpdate } from "./changelog";
import { ReleaseNotesModal, allEntries, entriesForUpdate, vaultHasTaskSearchBlock } from "./release-notes";
import { DEFAULT_SETTINGS, TaskSearchSettingTab, TaskSearchSettings } from "./settings";
import { TaskSearchView, ViewState } from "./view";

export default class TaskSearchPlugin extends Plugin {
  settings: TaskSearchSettings = { ...DEFAULT_SETTINGS };

  /** Filter state per code block, so filters survive re-renders (e.g. after ticking a task). */
  private states = new Map<string, ViewState>();

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerMarkdownCodeBlockProcessor("task-search", (src, el, ctx) => {
      const { config, error, legacy } = parseBlock(src, parseYaml);
      // The block's position in the note is a key that survives edits of the block text.
      const info = ctx.getSectionInfo(el);
      const key = info ? `${ctx.sourcePath}::#${blockIndex(info.text, info.lineStart)}` : `${ctx.sourcePath}::${src}`;
      const state = this.stateFor(key, config);
      const writer = new BlockWriter(this.app, ctx, el, src);
      ctx.addChild(new TaskSearchView(this, el, config, ctx.sourcePath, state, writer, error, legacy));
    });

    this.addCommand({
      id: "show-release-notes",
      name: "Show release notes",
      callback: () => new ReleaseNotesModal(this.app, "Release notes", allEntries(this.manifest.version)).open(),
    });

    this.addSettingTab(new TaskSearchSettingTab(this.app, this));

    // Runs after the vault has loaded, so the update check doesn't delay startup.
    this.app.workspace.onLayoutReady(() => void this.showReleaseNotesAfterUpdate());
  }

  /** Opens the "What's new" window once after an update, then records the running version. */
  private async showReleaseNotesAfterUpdate(): Promise<void> {
    const current = this.manifest.version;
    const lastSeen = this.settings.lastSeenVersion;
    if (lastSeen === current) return;

    const { showSince } = await checkForUpdate(current, lastSeen, () => vaultHasTaskSearchBlock(this.app));
    if (showSince && this.settings.showReleaseNotes) {
      const entries = entriesForUpdate(showSince, current);
      if (entries.length) new ReleaseNotesModal(this.app, "What's new in Task search", entries).open();
    }

    this.settings.lastSeenVersion = current;
    await this.saveSettings();
  }

  /**
   * The UI state of a block. When the status option in the block text has changed
   * (edited by hand), the status selection follows it; other filters are kept.
   */
  private stateFor(key: string, cfg: BlockConfig): ViewState {
    const blockStatus = cfg.status.join(",");
    let s = this.states.get(key);
    if (!s) {
      s = { filter: "", tag: "", statuses: new Set(cfg.status), blockStatus, collapsed: new Set() };
      this.states.set(key, s);
    } else if (s.blockStatus !== blockStatus) {
      s.statuses.clear();
      for (const id of cfg.status) s.statuses.add(id);
      s.blockStatus = blockStatus;
    }
    return s;
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<TaskSearchSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...saved };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
