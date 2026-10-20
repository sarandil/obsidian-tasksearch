import {
  App,
  CachedMetadata,
  Component,
  Keymap,
  MarkdownRenderChild,
  MarkdownRenderer,
  Menu,
  Notice,
  PaneType,
  TFile,
  debounce,
  getAllTags,
} from "obsidian";
import {
  Config,
  STATUS_CHOICES,
  STATUS_FILTERS,
  fmGet,
  inSource,
  noteMatchesQuery,
  setTaskStatus,
  splitList,
  matchesStatuses,
  taskText,
  toText,
  toggleStatus,
} from "./logic";
import { DEFAULT_SETTINGS } from "./settings";
import { StatusPicker } from "./status-picker";
import type TaskSearchPlugin from "./main";

/** Filter state of one code block; kept by the plugin so it survives re-renders. */
export interface ViewState {
  filter: string;
  tag: string;
  /** Selected statuses (ids from STATUS_FILTERS). */
  statuses: Set<string>;
  collapsed: Set<string>;
}

interface TaskItem {
  line: number;
  status: string;
  text: string;
  raw: string;
  depth: number;
}

interface TaskGroup {
  file: TFile;
  title: string;
  tags: string[];
  tasks: TaskItem[];
}

const REFRESH_DELAY_MS = 500;

/** Renders one `task-search` code block. */
export class TaskSearchView extends MarkdownRenderChild {
  private app: App;
  private data: TaskGroup[] = [];
  private loaded = false;
  private loadId = 0;

  private input!: HTMLInputElement;
  private tagSel!: HTMLSelectElement;
  private statusPicker!: StatusPicker;
  private counter!: HTMLElement;
  private list!: HTMLElement;

  /** Owns everything rendered into the list; replaced on every render so nothing leaks. */
  private renderScope: Component = new Component();

  constructor(
    private plugin: TaskSearchPlugin,
    containerEl: HTMLElement,
    private cfg: Config,
    private sourcePath: string,
    private state: ViewState,
  ) {
    super(containerEl);
    this.app = plugin.app;
  }

  onload(): void {
    const root = this.containerEl;
    root.empty();
    root.addClass("tsearch");

    const bar = root.createDiv({ cls: "tsearch-bar" });

    this.input = bar.createEl("input", { type: "search", placeholder: "Filter by title or task text…" });
    this.input.value = this.state.filter;
    this.input.addEventListener("input", () => {
      this.state.filter = this.input.value;
      this.render();
    });

    this.tagSel = bar.createEl("select", { cls: "dropdown" });
    this.tagSel.addEventListener("change", () => {
      this.state.tag = this.tagSel.value;
      this.render();
    });

    this.statusPicker = this.addChild(new StatusPicker(bar, this.state.statuses, () => this.render()));

    this.counter = bar.createSpan({ cls: "tsearch-count" });
    this.renderCriteria(root);
    this.list = root.createDiv({ cls: "tsearch-list" });
    this.list.createDiv({ cls: "tsearch-empty", text: "Loading…" });

    // Internal links rendered inside task text
    this.registerDomEvent(this.list, "click", (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a.internal-link");
      if (!(a instanceof HTMLAnchorElement) || a.hasClass("tsearch-title")) return;
      e.preventDefault();
      const href = a.dataset.href ?? a.getAttr("href") ?? "";
      void this.app.workspace.openLinkText(href, this.sourcePath, Keymap.isModEvent(e));
    });

    const refresh = debounce(() => void this.reload(), REFRESH_DELAY_MS, true);
    this.registerEvent(this.app.metadataCache.on("changed", () => refresh()));
    this.registerEvent(this.app.vault.on("delete", () => refresh()));
    this.registerEvent(this.app.vault.on("rename", () => refresh()));
    this.app.workspace.onLayoutReady(() => void this.reload());
  }

  // ----- data -----

  private async reload(): Promise<void> {
    const my = ++this.loadId;
    let data: TaskGroup[];
    try {
      data = await this.collect();
    } catch (err) {
      console.error("[task-search]", err);
      this.list.empty();
      this.list.createDiv({ cls: "tsearch-empty", text: "Search failed – see the developer console for details." });
      return;
    }
    if (my !== this.loadId) return;
    data.sort((a, b) => a.title.localeCompare(b.title));
    this.data = data;
    this.loaded = true;
    this.rebuildTagOptions();
    this.render();
  }

  private async collect(): Promise<TaskGroup[]> {
    const needle = (this.cfg["query"] ?? "").toLowerCase().trim();
    const props = splitList(this.cfg["properties"]);
    const sources = splitList(this.cfg["source"]);
    const out: TaskGroup[] = [];

    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.path === this.sourcePath) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      const items = cache?.listItems;
      if (!items || !items.some(li => li.task !== undefined)) continue;
      const tags = this.tagsOf(cache);
      if (!inSource(file.path, tags, sources)) continue;
      if (!noteMatchesQuery(cache?.frontmatter ?? {}, props, needle)) continue;

      const lines = (await this.app.vault.cachedRead(file)).split("\n");
      const depthByLine = new Map<number, number>();
      const tasks: TaskItem[] = [];
      for (const li of items) {
        const ln = li.position.start.line;
        const depth = li.parent >= 0 ? (depthByLine.get(li.parent) ?? 0) + 1 : 0;
        depthByLine.set(ln, depth);
        if (li.task === undefined) continue;
        const raw = (lines[ln] ?? "").replace(/\r$/, "");
        const text = taskText(raw);
        if (text === null) continue;
        tasks.push({ line: ln, status: li.task, text, raw, depth });
      }
      if (tasks.length) out.push({ file, title: this.titleOf(file, cache), tags, tasks });
    }
    return out;
  }

  private titleOf(file: TFile, cache: CachedMetadata | null): string {
    const key = this.plugin.settings.titleProperty.trim() || DEFAULT_SETTINGS.titleProperty;
    const v = cache?.frontmatter ? fmGet(cache.frontmatter, key) : undefined;
    return toText(v).trim() || file.basename;
  }

  private tagsOf(cache: CachedMetadata | null): string[] {
    return cache ? [...new Set(getAllTags(cache) ?? [])] : [];
  }

  // ----- rendering -----

  /** One line under the toolbar summarising what the block searches for. */
  private renderCriteria(root: HTMLElement): void {
    const query = (this.cfg["query"] ?? "").trim();
    const props = splitList(this.cfg["properties"]);
    const sources = splitList(this.cfg["source"]);
    const criteria: [string, string][] = query
      ? [
          ["Query", query],
          ["Properties", props.length && !props.includes("*") ? props.join(", ") : "any property"],
        ]
      : [["Query", "none – all notes with tasks"]];
    criteria.push(["Source", sources.length ? sources.join(", ") : "entire vault"]);

    const el = root.createDiv({ cls: "tsearch-criteria" });
    for (const [label, value] of criteria) {
      const chip = el.createSpan({ cls: "tsearch-chip" });
      chip.createSpan({ cls: "tsearch-chip-label", text: label });
      chip.createSpan({ cls: "tsearch-chip-value", text: value });
    }
  }

  private rebuildTagOptions(): void {
    const tags = [...new Set(this.data.flatMap(g => g.tags))].sort((a, b) => a.localeCompare(b));
    this.tagSel.empty();
    this.tagSel.createEl("option", { text: "All tags", value: "" });
    for (const t of tags) this.tagSel.createEl("option", { text: t, value: t });
    this.tagSel.value = tags.includes(this.state.tag) ? this.state.tag : "";
  }

  private render(): void {
    if (!this.loaded) return;
    this.removeChild(this.renderScope);
    this.renderScope = this.addChild(new Component());
    this.list.empty();

    const filter = this.input.value.toLowerCase().trim();
    const tag = this.tagSel.value;
    const visible = this.data
      .filter(g => !tag || g.tags.includes(tag))
      .map(g => {
        const titleHit = !filter || g.title.toLowerCase().includes(filter);
        return { g, tasks: g.tasks.filter(t => titleHit || t.text.toLowerCase().includes(filter)) };
      });

    // Per-status counts (respecting the tag and text filters) shown in the status picker
    const counts = new Map<string, number>();
    for (const s of STATUS_FILTERS) {
      counts.set(s.id, visible.reduce((acc, v) => acc + v.tasks.filter(t => s.test(t.status)).length, 0));
    }
    this.statusPicker.setCounts(counts);

    const selected = this.state.statuses;
    let nNotes = 0;
    let nTasks = 0;
    for (const { g, tasks: all } of visible) {
      const tasks = all.filter(t => matchesStatuses(t.status, selected));
      if (!tasks.length) continue;
      nNotes++;
      nTasks += tasks.length;
      const ul = this.renderGroup(g, tasks.length);
      for (const t of tasks) this.renderTask(ul, g, t);
    }

    this.counter.setText(
      `${nNotes} ${nNotes === 1 ? "note" : "notes"} · ${nTasks} ${nTasks === 1 ? "task" : "tasks"}`,
    );
    if (!this.list.hasChildNodes()) {
      const text = selected.size ? "No matching tasks." : "Select at least one status to show tasks.";
      this.list.createDiv({ cls: "tsearch-empty", text });
    }
  }

  /** Renders the collapsible group heading; returns the task list element. */
  private renderGroup(g: TaskGroup, count: number): HTMLElement {
    const det = this.list.createEl("details", { cls: "tsearch-group" });
    det.open = !this.state.collapsed.has(g.file.path);
    det.addEventListener("toggle", () => {
      if (det.open) this.state.collapsed.delete(g.file.path);
      else this.state.collapsed.add(g.file.path);
    });

    const sum = det.createEl("summary");
    const a = sum.createEl("a", { text: g.title, cls: "tsearch-title internal-link", href: g.file.path });
    a.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      void this.openFile(g.file, Keymap.isModEvent(e));
    });
    sum.createSpan({ cls: "tsearch-meta", text: String(count) });

    return det.createEl("ul", { cls: "contains-task-list tsearch-tasks" });
  }

  private renderTask(ul: HTMLElement, g: TaskGroup, t: TaskItem): void {
    const li = ul.createEl("li", { cls: "task-list-item tsearch-task", attr: { "data-task": t.status } });
    if (t.status !== " ") li.addClass("is-checked");
    li.setCssProps({ "--tsearch-depth": String(t.depth) });

    const cb = li.createEl("input", {
      type: "checkbox",
      cls: "task-list-item-checkbox",
      attr: { "data-task": t.status },
    });
    cb.checked = t.status !== " ";
    cb.addEventListener("click", e => {
      e.preventDefault();
      void this.setStatus(g, t, toggleStatus(t.status));
    });

    li.addEventListener("contextmenu", e => {
      e.preventDefault();
      const menu = new Menu();
      for (const [ch, label] of STATUS_CHOICES) {
        menu.addItem(i =>
          i.setTitle(label).setChecked(t.status === ch).onClick(() => void this.setStatus(g, t, ch)),
        );
      }
      menu.addSeparator();
      menu.addItem(i =>
        i.setTitle("Open note").setIcon("file-text").onClick(() => void this.openFile(g.file, false, t.line)),
      );
      menu.showAtMouseEvent(e);
    });

    const span = li.createSpan({ cls: "tsearch-task-text" });
    void this.renderInline(t.text, span, g.file.path);
    span.addEventListener("click", e => {
      if ((e.target as HTMLElement).closest("a, .tag")) return;
      void this.openFile(g.file, Keymap.isModEvent(e), t.line);
    });
  }

  /** Renders Markdown (links, tags, formatting) without the wrapping paragraph. */
  private async renderInline(markdown: string, el: HTMLElement, sourcePath: string): Promise<void> {
    await MarkdownRenderer.render(this.app, markdown, el, sourcePath, this.renderScope);
    const p = el.firstElementChild;
    if (p && p.tagName === "P" && el.childElementCount === 1) p.replaceWith(...Array.from(p.childNodes));
  }

  // ----- actions -----

  private async setStatus(g: TaskGroup, t: TaskItem, ch: string): Promise<void> {
    if (ch === t.status) return;
    let newRaw: string | null = null;
    await this.app.vault.process(g.file, data => {
      const lines = data.split("\n");
      const current = lines[t.line] ?? "";
      const cr = current.endsWith("\r") ? "\r" : "";
      if (current.replace(/\r$/, "") !== t.raw) return data;
      newRaw = setTaskStatus(t.raw, ch);
      if (newRaw === null) return data;
      lines[t.line] = newRaw + cr;
      return lines.join("\n");
    });
    if (newRaw === null) {
      new Notice("The note has changed in the meantime – the list has been refreshed, please try again.");
      void this.reload();
      return;
    }
    t.status = ch;
    t.raw = newRaw;
    this.render();
  }

  private async openFile(file: TFile, newLeaf: PaneType | boolean, line?: number): Promise<void> {
    const leaf = this.app.workspace.getLeaf(newLeaf);
    await leaf.openFile(file, line != null ? { eState: { line } } : undefined);
  }
}
