import { Component, setTooltip } from "obsidian";
import { STATUS_FILTERS } from "./logic";

interface OptionRow {
  checkbox: HTMLInputElement;
  count: HTMLElement;
}

const POPOVER_GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;

/**
 * Dropdown-style multi-select for task statuses, similar to the property picker in Bases:
 * the button shows the current selection, and the popover stays open while options are toggled.
 * It closes on an outside click, Escape, scrolling or resizing.
 */
export class StatusPicker extends Component {
  private button: HTMLButtonElement;
  private summary: HTMLElement;
  private popover: HTMLElement | null = null;
  private rows = new Map<string, OptionRow>();
  private counts = new Map<string, number>();

  constructor(
    parent: HTMLElement,
    private selected: Set<string>,
    private onChange: () => void,
  ) {
    super();
    this.button = parent.createEl("button", {
      cls: "dropdown tsearch-status-button",
      attr: { "aria-haspopup": "true", "aria-expanded": "false" },
    });
    this.summary = this.button.createSpan({ cls: "tsearch-status-summary" });
    this.updateSummary();
  }

  onload(): void {
    const doc = this.button.doc;
    const win = this.button.win;

    this.registerDomEvent(this.button, "click", e => {
      e.preventDefault();
      if (this.popover) this.close();
      else this.open();
    });

    this.registerDomEvent(doc, "mousedown", e => {
      if (!this.popover) return;
      const target = e.target as Node;
      if (this.popover.contains(target) || this.button.contains(target)) return;
      this.close();
    });

    this.registerDomEvent(doc, "keydown", e => {
      if (this.popover && e.key === "Escape") {
        e.preventDefault();
        this.close();
        this.button.focus();
      }
    });

    this.registerDomEvent(
      doc,
      "scroll",
      e => {
        if (this.popover && !this.popover.contains(e.target as Node)) this.close();
      },
      { capture: true },
    );
    this.registerDomEvent(win, "resize", () => this.close());
  }

  onunload(): void {
    this.close();
  }

  /** Updates the per-status task counts shown in the popover. */
  setCounts(counts: Map<string, number>): void {
    this.counts = counts;
    this.refreshRows();
  }

  private updateSummary(): void {
    const chosen = STATUS_FILTERS.filter(s => this.selected.has(s.id));
    let text: string;
    if (chosen.length === STATUS_FILTERS.length) text = "All statuses";
    else if (!chosen.length) text = "No status";
    else text = chosen.map(s => s.label).join(", ");
    this.summary.setText(text);
    setTooltip(this.button, `Status: ${text}`);
  }

  private open(): void {
    const pop = this.button.doc.body.createDiv({
      cls: "menu tsearch-status-menu",
      attr: { role: "group", "aria-label": "Task status" },
    });
    this.popover = pop;
    this.rows.clear();

    for (const s of STATUS_FILTERS) {
      const row = pop.createEl("label", { cls: "menu-item tsearch-status-option" });
      const checkbox = row.createEl("input", { type: "checkbox" });
      row.createSpan({ cls: "menu-item-title", text: s.label });
      row.createSpan({ cls: "tsearch-status-symbol", text: s.symbol });
      const count = row.createSpan({ cls: "tsearch-status-option-count" });
      setTooltip(row, s.hint, { placement: "right" });

      checkbox.addEventListener("change", () => {
        if (checkbox.checked) this.selected.add(s.id);
        else this.selected.delete(s.id);
        this.updateSummary();
        this.onChange();
      });
      this.rows.set(s.id, { checkbox, count });
    }

    this.refreshRows();
    this.position(pop);
    this.button.setAttr("aria-expanded", "true");
    this.rows.get(STATUS_FILTERS[0].id)?.checkbox.focus();
  }

  private close(): void {
    if (!this.popover) return;
    this.popover.detach();
    this.popover = null;
    this.rows.clear();
    this.button.setAttr("aria-expanded", "false");
  }

  private refreshRows(): void {
    for (const [id, row] of this.rows) {
      row.checkbox.checked = this.selected.has(id);
      row.count.setText(String(this.counts.get(id) ?? 0));
    }
  }

  /** Places the popover under the button, kept inside the viewport. */
  private position(pop: HTMLElement): void {
    const win = this.button.win;
    const rect = this.button.getBoundingClientRect();
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;

    let left = rect.left;
    if (left + width > win.innerWidth - VIEWPORT_MARGIN_PX) {
      left = Math.max(VIEWPORT_MARGIN_PX, win.innerWidth - width - VIEWPORT_MARGIN_PX);
    }
    let top = rect.bottom + POPOVER_GAP_PX;
    if (top + height > win.innerHeight - VIEWPORT_MARGIN_PX) {
      top = Math.max(VIEWPORT_MARGIN_PX, rect.top - height - POPOVER_GAP_PX);
    }
    pop.setCssProps({ "--tsearch-pop-left": `${left}px`, "--tsearch-pop-top": `${top}px` });
  }
}
