import { App, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import type TaskSearchPlugin from "./main";

export interface TaskSearchSettings {
  titleProperty: string;
  showReleaseNotes: boolean;
  /** Plugin version that last ran; not shown in the settings tab. */
  lastSeenVersion?: string;
}

export const DEFAULT_SETTINGS: TaskSearchSettings = { titleProperty: "title", showReleaseNotes: true };

const TITLE_SETTING_NAME = "Title property";
const TITLE_SETTING_DESC =
  "Frontmatter property used as the group heading (default: title). Falls back to the file name when the note doesn't have it.";

const RELEASE_NOTES_SETTING_NAME = "Show release notes after updates";
const RELEASE_NOTES_SETTING_DESC =
  "Open a window with the changes after Task search is updated. You can always open it with the Show release notes command.";

export class TaskSearchSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: TaskSearchPlugin,
  ) {
    super(app, plugin);
  }

  /** Declarative settings (Obsidian 1.13+), so the options show up in settings search. */
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: TITLE_SETTING_NAME,
        desc: TITLE_SETTING_DESC,
        control: { type: "text", key: "titleProperty", defaultValue: DEFAULT_SETTINGS.titleProperty },
      },
      {
        name: RELEASE_NOTES_SETTING_NAME,
        desc: RELEASE_NOTES_SETTING_DESC,
        control: { type: "toggle", key: "showReleaseNotes", defaultValue: DEFAULT_SETTINGS.showReleaseNotes },
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
    new Setting(containerEl)
      .setName(RELEASE_NOTES_SETTING_NAME)
      .setDesc(RELEASE_NOTES_SETTING_DESC)
      .addToggle(t =>
        t.setValue(this.plugin.settings.showReleaseNotes).onChange(async v => {
          this.plugin.settings.showReleaseNotes = v;
          await this.plugin.saveSettings();
        }),
      );
  }
}
