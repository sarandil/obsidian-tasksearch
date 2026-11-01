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
  setIcon,
} from "obsidian";
import { BlockConfig } from "./block-config";
import type { BlockWriter } from "./block-writer";
import { PanelField, SearchPanel } from "./search-panel";
import {
  STATUS_CHOICES,
  STATUS_FILTERS,
  fmGet,
  inSource,
  noteMatchesQuery,
  setTaskStatus,
  matchesStatuses,
  taskText,
  toText,
  toggleStatus,
} from "./logic";
import { ReleaseNotesModal, allEntries } from "./release-notes";
import { DEFAULT_SETTINGS } from "./settings";
import { StatusPicker } from "./status-picker";
import type TaskSearchPlugin from "./main";

/** Filter state of one code block; kept by the plugin so it survives re-renders. */
export interface ViewState {
  filter: string;
  tag: string;
  /** Selected statuses (ids from STATUS_FILTERS). */
  statuses: Set<string>;
  /** The `status` option of the block when the selection was last synced with it. */
  blockStatus: string;
  /** Whether the search settings panel is open. */
  panelOpen: boolean;
  /** Panel field to focus after the next render (set when a panel change is saved). */
  panelFocus: PanelField | null;
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
  private searchButton!: HTMLButtonElement;
  private panel: SearchPanel | null = null;
  private panelEl: HTMLElement | null = null;
  private criteriaEl!: HTMLElement;
  /** A change is being written to the block; the view is replaced when it is done. */
  private saving = false;

  /** Owns everything rendered into the list; replaced on every render so nothing leaks. */
  private renderScope: Component = new Component();

  constructor(
    private plugin: TaskSearchPlugin,
    containerEl: HTMLElement,
    private cfg: BlockConfig,
    private sourcePath: string,
    private state: ViewState,
    private writer: BlockWriter,
    private configError?: string,
    /** The block is in the pre-0.4.0 format; the error offers the release notes. */
    private legacyFormat = false,
  ) {
    super(containerEl);
    this.app = plugin.app;
  }

  onload(): void {
    const root = this.containerEl;
    root.empty();
    root.addClass("tsearch");

    if (this.configError) {
      const err = root.createDiv({ cls: "tsearch-error" });
      err.createSpan({ text: this.configError });
      if (this.legacyFormat) {
        const btn = err.createEl("button", { cls: "tsearch-error-action", text: "Show release notes" });
        btn.addEventListener("click", () =>
          new ReleaseNotesModal(this.app, "Release notes", allEntries(this.plugin.manifest.version)).open(),
        );
      }
      return;
    }

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

    this.statusPicker = this.addChild(
      new StatusPicker(
        bar,
        this.state.statuses,
        () => this.render(),
        // Saved when the dropdown closes: the re-render after the write would close it.
        () => void this.saveStatuses(),
      ),
    );

    this.searchButton = bar.createEl("button", {
      cls: "tsearch-search-button",
      text: "Search",
      attr: { "aria-expanded": "false" },
    });
    setIcon(this.searchButton.createSpan({ cls: "tsearch-search-icon", prepend: true }), "sliders-horizontal");
    this.searchButton.addEventListener("click", () => this.togglePanel(!this.state.panelOpen));

    this.counter = bar.createSpan({ cls: "tsearch-count" });
    this.panelEl = root.createDiv({ cls: "tsearch-panel-host" });
    this.criteriaEl = root.createDiv({ cls: "tsearch-criteria" });
    this.renderCriteria();
    this.list = root.createDiv({ cls: "tsearch-list" });
    this.togglePanel(this.state.panelOpen, this.state.panelFocus ?? undefined);
    this.state.panelFocus = null;
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
    const { properties, folders, tags: sourceTags, includeSelf } = this.cfg;
    const needle = this.cfg.query.toLowerCase();
    const out: TaskGroup[] = [];

    for (const file of this.app.vault.getMarkdownFiles()) {
      const isHost = file.path === this.sourcePath;
      if (isHost && !includeSelf) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      const items = cache?.listItems;
      if (!items || !items.some(li => li.task !== undefined)) continue;
      const tags = this.tagsOf(cache);
      // With include-self the host note is always shown, whatever the query, properties and source.
      if (!isHost) {
        if (!inSource(file.path, tags, folders, sourceTags)) continue;
        if (!noteMatchesQuery(cache?.frontmatter ?? {}, properties, needle)) continue;
      }

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

  /** Opens or closes the search settings panel; the criteria chips are hidden while it is open. */
  private togglePanel(open: boolean, focus?: PanelField): void {
    this.state.panelOpen = open;
    this.searchButton.setAttr("aria-expanded", String(open));
    this.searchButton.toggleClass("is-active", open);
    this.criteriaEl.toggle(!open);
    const host = this.panelEl;
    if (!host) return;
    host.empty();
    this.panel = null;
    if (!open) return;
    this.panel = new SearchPanel(this.app, this.cfg, (next, field) => void this.saveConfig(next, field));
    this.panel.render(host);
    if (!focus) return;
    // After a re-render the block may not be in the document yet; focus once it is.
    const panel = this.panel;
    if (host.isConnected) panel.focus(focus);
    else host.win.requestAnimationFrame(() => panel.focus(focus));
  }

  /**
   * Writes a changed configuration to the block. Until the block is re-rendered, further
   * changes are ignored, because they would be checked against the old block text.
   * `focus` is the panel field to focus in the re-rendered view.
   */
  private async saveConfig(next: BlockConfig, focus: PanelField | null = null): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    this.containerEl.addClass("tsearch-is-saving");
    this.state.panelFocus = focus;
    const written = await this.writer.save(next);
    if (!written) {
      // Nothing changed or the write failed: this view stays, so it takes input again.
      this.saving = false;
      this.containerEl.removeClass("tsearch-is-saving");
      this.state.panelFocus = null;
    }
  }

  /** One line under the toolbar summarising what the block searches for; a click opens the panel. */
  private renderCriteria(): void {
    const { query, properties, folders, tags, includeSelf } = this.cfg;
    const criteria: [string, string, PanelField][] = query
      ? [
          ["Query", query, "query"],
          [
            "Properties",
            properties.length && !properties.includes("*") ? properties.join(", ") : "any property",
            "properties",
          ],
        ]
      : [["Query", "none – all notes with tasks", "query"]];
    if (folders.length) criteria.push(["Folders", folders.join(", "), "folders"]);
    if (tags.length) criteria.push(["Tags", tags.join(", "), "tags"]);
    if (!folders.length && !tags.length) criteria.push(["Source", "entire vault", "folders"]);
    if (includeSelf) criteria.push(["Include this note", "yes", "include-self"]);

    for (const [label, value, field] of criteria) {
      const chip = this.criteriaEl.createSpan({
        cls: "tsearch-chip tsearch-criteria-chip",
        attr: { role: "button", tabindex: "0", "aria-label": `Edit ${label.toLowerCase()}` },
      });
      chip.createSpan({ cls: "tsearch-chip-label", text: label });
      chip.createSpan({ cls: "tsearch-chip-value", text: value });
      chip.addEventListener("click", () => this.togglePanel(true, field));
      chip.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.togglePanel(true, field);
        }
      });
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

  /** Writes the status selection to the block; an empty selection is not saved. */
  private async saveStatuses(): Promise<void> {
    if (!this.state.statuses.size || this.saving) return;
    const status = STATUS_FILTERS.map(f => f.id).filter(id => this.state.statuses.has(id));
    this.state.blockStatus = status.join(",");
    await this.saveConfig({ ...this.cfg, status });
  }

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
