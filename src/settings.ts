import { App, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import type TaskSearchPlugin from "./main";

export interface TaskSearchSettings {
  titleProperty: string;
}

export const DEFAULT_SETTINGS: TaskSearchSettings = { titleProperty: "title" };

const TITLE_SETTING_NAME = "Title property";
const TITLE_SETTING_DESC =
  "Frontmatter property used as the group heading (default: title). Falls back to the file name when the note doesn't have it.";

export class TaskSearchSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: TaskSearchPlugin,
  ) {
    super(app, plugin);
  }

  /** Declarative settings (Obsidian 1.13+), so the option shows up in settings search. */
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: TITLE_SETTING_NAME,
        desc: TITLE_SETTING_DESC,
        control: { type: "text", key: "titleProperty", defaultValue: DEFAULT_SETTINGS.titleProperty },
      },
    ];
  }

  /** Classic settings UI for Obsidian versions before 1.13. */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName(TITLE_SETTING_NAME)
      .setDesc(TITLE_SETTING_DESC)
      .addText(t =>
        t.setValue(this.plugin.settings.titleProperty).onChange(async v => {
          this.plugin.settings.titleProperty = v.trim();
          await this.plugin.saveSettings();
        }),
      );
  }
}
