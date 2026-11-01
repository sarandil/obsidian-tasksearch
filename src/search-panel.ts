import { AbstractInputSuggest, App, TFolder, getAllTags, setIcon } from "obsidian";
import { BlockConfig, normalizeFolder, normalizeTag } from "./block-config";

/** Fields of the panel that can get the focus after the block has been saved and re-rendered. */
export type PanelField = "query" | "properties" | "folders" | "tags" | "include-self";

/** List options edited with chips. */
type ListField = "properties" | "folders" | "tags";

interface ListRow {
  field: ListField;
  label: string;
  placeholder: string;
  values: (cfg: BlockConfig) => string[];
  suggestions: (app: App) => string[];
  normalize: (value: string) => string;
}

const LIST_ROWS: ListRow[] = [
  {
    field: "properties",
    label: "Properties",
    placeholder: "Add property…",
    values: cfg => cfg.properties,
    suggestions: propertyNames,
    normalize: v => v.trim(),
  },
  {
    field: "folders",
    label: "Folders",
    placeholder: "Add folder…",
    values: cfg => cfg.folders,
    suggestions: folderPaths,
    normalize: normalizeFolder,
  },
  {
    field: "tags",
    label: "Tags",
    placeholder: "Add tag…",
    values: cfg => cfg.tags,
    suggestions: tagNames,
    normalize: normalizeTag,
  },
];

/**
 * The search settings panel under the toolbar. Every change is handed to `onChange`
 * as a complete configuration, which the view saves to the code block.
 */
export class SearchPanel {
  private fields = new Map<PanelField, HTMLElement>();

  constructor(
    private app: App,
    private cfg: BlockConfig,
    private onChange: (next: BlockConfig, focus: PanelField) => void,
  ) {}

  render(parent: HTMLElement): HTMLElement {
    const panel = parent.createDiv({ cls: "tsearch-panel", attr: { role: "group", "aria-label": "Search settings" } });

    // Query: saved on Enter or when the field loses focus, not on every key press.
    const queryRow = this.row(panel, "Query");
    const query = queryRow.createEl("input", {
      type: "text",
      cls: "tsearch-panel-query",
      placeholder: "Text to find in the note properties – empty lists every note with tasks",
    });
    query.value = this.cfg.query;
    query.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        query.blur();
      }
    });
    query.addEventListener("change", () => this.emit({ query: query.value.trim() }, "query"));
    this.fields.set("query", query);

    for (const row of LIST_ROWS) this.renderList(panel, row);

    const selfRow = this.row(panel, "Include this note");
    const label = selfRow.createEl("label", { cls: "tsearch-panel-check" });
    const check = label.createEl("input", { type: "checkbox" });
    check.checked = this.cfg.includeSelf;
    label.createSpan({ text: "Show tasks from the note that contains the block" });
    check.addEventListener("change", () => this.emit({ includeSelf: check.checked }, "include-self"));
    this.fields.set("include-self", check);

    panel.createDiv({ cls: "tsearch-panel-hint", text: "Changes are saved to the code block." });
    return panel;
  }

  /** Moves the focus to a field, e.g. after the view has been re-rendered. */
  focus(field: PanelField): void {
    const el = this.fields.get(field);
    if (!el) return;
    el.focus();
    if (el.instanceOf(HTMLInputElement) && el.type === "text") el.setSelectionRange(el.value.length, el.value.length);
  }

  private row(panel: HTMLElement, label: string): HTMLElement {
    const row = panel.createDiv({ cls: "tsearch-panel-row" });
    row.createDiv({ cls: "tsearch-panel-label", text: label });
    return row.createDiv({ cls: "tsearch-panel-control" });
  }

  private renderList(panel: HTMLElement, row: ListRow): void {
    const control = this.row(panel, row.label);
    const values = row.values(this.cfg);

    for (const value of values) {
      const chip = control.createSpan({ cls: "tsearch-chip tsearch-panel-chip" });
      chip.createSpan({ cls: "tsearch-chip-value", text: value });
      const remove = chip.createEl("button", {
        cls: "clickable-icon tsearch-chip-remove",
        attr: { "aria-label": `Remove ${value}` },
      });
      setIcon(remove, "x");
      remove.addEventListener("click", () =>
        this.emit({ [row.field]: values.filter(v => v !== value) }, row.field),
      );
    }

    const input = control.createEl("input", { type: "text", cls: "tsearch-panel-add", placeholder: row.placeholder });
    const add = (raw: string) => {
      const value = row.normalize(raw);
      if (!value || values.includes(value)) {
        input.value = "";
        return;
      }
      this.emit({ [row.field]: [...values, value] }, row.field);
    };
    const suggest = new ListSuggest(this.app, input, () => row.suggestions(this.app).filter(s => !values.includes(s)), add);
    // Free text is allowed too, e.g. a property that no note has yet. While the suggestion
    // list is open, Enter picks the highlighted suggestion instead.
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.isComposing && !suggest.isOpen) {
        e.preventDefault();
        add(input.value);
      }
    });
    this.fields.set(row.field, input);
  }

  private emit(change: Partial<BlockConfig>, focus: PanelField): void {
    this.onChange({ ...this.cfg, ...change }, focus);
  }
}

/** Suggestions for an "Add …" input; the list is collected once, when it is first needed. */
class ListSuggest extends AbstractInputSuggest<string> {
  private items: string[] | null = null;
  isOpen = false;

  constructor(
    app: App,
    private input: HTMLInputElement,
    private source: () => string[],
    private pick: (value: string) => void,
  ) {
    super(app, input);
    this.limit = 50;
  }

  protected getSuggestions(query: string): string[] {
    this.items ??= this.source();
    const q = query.toLowerCase().trim();
    return q ? this.items.filter(i => i.toLowerCase().includes(q)) : this.items;
  }

  open(): void {
    super.open();
    this.isOpen = true;
  }

  close(): void {
    super.close();
    this.isOpen = false;
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value);
  }

  selectSuggestion(value: string): void {
    this.close();
    this.input.value = "";
    this.pick(value);
  }
}

/** Every frontmatter property name used in the vault, sorted. */
function propertyNames(app: App): string[] {
  const names = new Set<string>();
  for (const file of app.vault.getMarkdownFiles()) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm) for (const key of Object.keys(fm)) names.add(key);
  }
  return sorted(names);
}

/** Every folder of the vault except the root, sorted. */
function folderPaths(app: App): string[] {
  const paths = new Set<string>();
  for (const f of app.vault.getAllLoadedFiles()) {
    if (f instanceof TFolder && !f.isRoot()) paths.add(f.path);
  }
  return sorted(paths);
}

/** Every tag used in the vault, without `#`, sorted. */
function tagNames(app: App): string[] {
  const tags = new Set<string>();
  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    if (cache) for (const t of getAllTags(cache) ?? []) tags.add(normalizeTag(t));
  }
  return sorted(tags);
}

function sorted(values: Set<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}
