import { Plugin } from "obsidian";
import { Config, parseConfig, parseStatuses } from "./logic";
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
      const cfg = parseConfig(src);
      const state = this.stateFor(`${ctx.sourcePath}::${src}`, cfg);
      ctx.addChild(new TaskSearchView(this, el, cfg, ctx.sourcePath, state));
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

  private stateFor(key: string, cfg: Config): ViewState {
    let s = this.states.get(key);
    if (!s) {
      s = { filter: "", tag: "", statuses: new Set(parseStatuses(cfg["status"])), collapsed: new Set() };
      this.states.set(key, s);
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
