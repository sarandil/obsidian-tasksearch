import {
  App,
  Editor,
  MarkdownPostProcessorContext,
  MarkdownView,
  Notice,
  TFile,
  parseYaml,
  stringifyYaml,
} from "obsidian";
import { BlockConfig, parseBlock, sameConfig, serializeBlock } from "./block-config";
import { blockContentEdit, replaceBlockContent } from "./block-source";

/** Writes configuration changes made in the rendered view back to the code block. */
export class BlockWriter {
  constructor(
    private app: App,
    private ctx: MarkdownPostProcessorContext,
    private el: HTMLElement,
    /** The block text the view was rendered from. */
    private src: string,
  ) {}

  /**
   * Saves `cfg` to the block. Does nothing when it equals the block's current configuration.
   * When the note is open in an editor, the change goes through the editor, so it can be undone;
   * otherwise the file is rewritten. Returns true if the note was changed.
   */
  async save(cfg: BlockConfig): Promise<boolean> {
    if (sameConfig(cfg, parseBlock(this.src, parseYaml).config)) return false;

    const info = this.ctx.getSectionInfo(this.el);
    const file = this.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
    if (!info || !(file instanceof TFile)) {
      new Notice("Task search: couldn't save the change to the code block.");
      return false;
    }

    const content = serializeBlock(cfg, this.src, parseYaml, stringifyYaml);
    const editor = this.findEditor(file);
    const written = editor
      ? this.writeInEditor(editor, info.lineStart, info.lineEnd, content)
      : await this.writeInFile(file, info.lineStart, info.lineEnd, content);
    if (!written) new Notice("Task search: the code block has changed in the meantime, so the change wasn't saved.");
    return written;
  }

  /** The editor of the note, if it is open in Live Preview or Source mode. Prefers the pane with this block. */
  private findEditor(file: TFile): Editor | null {
    const views = this.app.workspace
      .getLeavesOfType("markdown")
      .map(leaf => leaf.view)
      .filter((v): v is MarkdownView => v instanceof MarkdownView && v.file?.path === file.path)
      .filter(v => v.getMode() === "source");
    const own = views.find(v => v.containerEl.contains(this.el));
    return (own ?? views[0])?.editor ?? null;
  }

  /** Replaces the block lines as one editor change, so Undo reverts it. */
  private writeInEditor(editor: Editor, lineStart: number, lineEnd: number, content: string): boolean {
    const edit = blockContentEdit(editor.getValue(), lineStart, lineEnd, this.src, content);
    if (!edit) return false;
    const text = edit.lines.map(l => l + "\n").join("");
    editor.replaceRange(text, { line: edit.from, ch: 0 }, { line: edit.to, ch: 0 });
    return true;
  }

  private async writeInFile(file: TFile, lineStart: number, lineEnd: number, content: string): Promise<boolean> {
    let written = false;
    await this.app.vault.process(file, data => {
      const next = replaceBlockContent(data, lineStart, lineEnd, this.src, content);
      if (next === null) return data;
      written = true;
      return next;
    });
    return written;
  }
}
