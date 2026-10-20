import { Plugin } from "obsidian";
import { Config, parseConfig, parseStatuses } from "./logic";
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

    this.addSettingTab(new TaskSearchSettingTab(this.app, this));
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
