/**
 * Slot-based saved game storage and picker UI.
 */
import { RetroModal } from "./retro-modal";
import { SerializedState } from "../types";

export const SAVE_SLOT_COUNT = 8;
export const SAVE_CHARACTER_NAME = "Captain Hazard";

const SAVE_SLOT_STORAGE_PREFIX = "darkwar-save-slot-";

export interface SaveSlotRecord {
  version: 1;
  slot: number;
  characterName: string;
  savedAt: string;
  region: string;
  screenshotDataUrl: string | null;
  state: SerializedState;
}

export interface SaveSlotSummary {
  slot: number;
  isEmpty: boolean;
  characterName?: string;
  savedAt?: string;
  region?: string;
  screenshotDataUrl?: string | null;
}

type SaveSlotMode = "save" | "load";

interface SaveSlotDialogOptions {
  onSaveSlot?: (slot: number) => Promise<boolean>;
  onLoadSlot?: (slot: number) => Promise<boolean>;
  onDeleteSlot?: (slot: number) => Promise<boolean>;
  onOpenChange?: (isOpen: boolean) => void;
}

function assertValidSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SAVE_SLOT_COUNT) {
    throw new Error("Invalid save slot.");
  }
}

function storageKeyForSlot(slot: number): string {
  assertValidSlot(slot);
  return `${SAVE_SLOT_STORAGE_PREFIX}${slot + 1}`;
}

function parseSaveRecord(
  data: string,
  fallbackSlot: number,
): SaveSlotRecord | null {
  try {
    const record = JSON.parse(data) as Partial<SaveSlotRecord>;
    if (!record || record.version !== 1 || !record.state) return null;
    const parsedSlot =
      Number.isInteger(record.slot) &&
      record.slot! >= 0 &&
      record.slot! < SAVE_SLOT_COUNT
        ? record.slot!
        : fallbackSlot;
    return {
      version: 1,
      slot: parsedSlot,
      characterName: record.characterName ?? SAVE_CHARACTER_NAME,
      savedAt: record.savedAt ?? new Date(0).toISOString(),
      region: record.region ?? "Unknown Region",
      screenshotDataUrl: record.screenshotDataUrl ?? null,
      state: record.state,
    };
  } catch {
    return null;
  }
}

export function getSaveRegionName(state: SerializedState): string {
  if (state.levelKind === "outside" || state.depth <= 0) {
    return "Megacorp Exterior";
  }
  return `Sublevel ${state.depth}`;
}

export function createSaveSlotRecord(
  slot: number,
  state: SerializedState,
  screenshotDataUrl: string | null,
): SaveSlotRecord {
  assertValidSlot(slot);
  return {
    version: 1,
    slot,
    characterName: SAVE_CHARACTER_NAME,
    savedAt: new Date().toISOString(),
    region: getSaveRegionName(state),
    screenshotDataUrl,
    state,
  };
}

export async function listSaveSlots(): Promise<SaveSlotSummary[]> {
  const summaries = new Map<number, SaveSlotSummary>();
  for (let slot = 0; slot < SAVE_SLOT_COUNT; slot++) {
    summaries.set(slot, { slot, isEmpty: true });
  }

  if (window.native?.saveList) {
    const result = await window.native.saveList();
    if (result.ok) {
      for (const entry of result.saves) {
        const record = parseSaveRecord(entry.data, entry.slot);
        if (record && entry.slot >= 0 && entry.slot < SAVE_SLOT_COUNT) {
          summaries.set(entry.slot, recordToSummary(record));
        }
      }
      return Array.from(summaries.values());
    }
  }

  for (let slot = 0; slot < SAVE_SLOT_COUNT; slot++) {
    const record = readLocalSaveSlot(slot);
    if (record) summaries.set(slot, recordToSummary(record));
  }

  return Array.from(summaries.values());
}

export async function hasSavedGame(): Promise<boolean> {
  const slots = await listSaveSlots();
  return slots.some((slot) => !slot.isEmpty);
}

export async function readMostRecentSaveSlot(): Promise<SaveSlotRecord | null> {
  const slots = await listSaveSlots();
  const newest = slots
    .filter((slot) => !slot.isEmpty && slot.savedAt)
    .sort((a, b) => Date.parse(b.savedAt!) - Date.parse(a.savedAt!))[0];
  return newest ? readSaveSlot(newest.slot) : null;
}

export async function readSaveSlot(
  slot: number,
): Promise<SaveSlotRecord | null> {
  assertValidSlot(slot);

  if (window.native?.saveReadSlot) {
    const result = await window.native.saveReadSlot(slot);
    if (result.ok && typeof result.data === "string") {
      return parseSaveRecord(result.data, slot);
    }
    if (result.ok && result.data === null) {
      return null;
    }
  }

  return readLocalSaveSlot(slot);
}

export async function writeSaveSlot(
  slot: number,
  record: SaveSlotRecord,
): Promise<void> {
  assertValidSlot(slot);
  const data = JSON.stringify(record);

  if (window.native?.saveWriteSlot) {
    const result = await window.native.saveWriteSlot(slot, data);
    if (result.ok) return;
    throw new Error(result.error ?? "Failed to write save.");
  }

  localStorage.setItem(storageKeyForSlot(slot), data);
}

export async function deleteSaveSlot(slot: number): Promise<void> {
  assertValidSlot(slot);

  if (window.native?.saveDeleteSlot) {
    const result = await window.native.saveDeleteSlot(slot);
    if (result.ok) return;
    throw new Error(result.error ?? "Failed to delete save.");
  }

  localStorage.removeItem(storageKeyForSlot(slot));
}

function readLocalSaveSlot(slot: number): SaveSlotRecord | null {
  try {
    const raw = localStorage.getItem(storageKeyForSlot(slot));
    return raw ? parseSaveRecord(raw, slot) : null;
  } catch {
    return null;
  }
}

function recordToSummary(record: SaveSlotRecord): SaveSlotSummary {
  return {
    slot: record.slot,
    isEmpty: false,
    characterName: record.characterName,
    savedAt: record.savedAt,
    region: record.region,
    screenshotDataUrl: record.screenshotDataUrl,
  };
}

export class SaveSlotDialog {
  private readonly options: SaveSlotDialogOptions;
  private readonly scrim: HTMLElement;
  private readonly modal: RetroModal;
  private mode: SaveSlotMode = "load";
  private slots: SaveSlotSummary[] = [];
  private selectedSlot = 0;
  private isBusy = false;

  constructor(options: SaveSlotDialogOptions) {
    this.options = options;
    this.scrim = document.createElement("div");
    this.scrim.className = "imb-modal-scrim hidden save-slot-scrim";

    this.modal = new RetroModal({
      id: "save-slot-dialog",
      title: "Saved Games",
      className: "save-slot-dialog",
      centerOnOpen: true,
      initialPosition: { top: 96, left: 96 },
      onClose: () => this.handleClosed(),
      body: `
        <div class="save-slot-status" id="save-slot-status" role="status" aria-live="polite"></div>
        <div class="save-slot-grid" id="save-slot-grid"></div>
      `,
    });
    this.modal.element.setAttribute("role", "dialog");
    this.modal.element.setAttribute("aria-modal", "true");
    document.body.appendChild(this.scrim);
    document.body.appendChild(this.modal.element);
    this.modal.element.addEventListener("keydown", (event) =>
      this.handleKeyDown(event),
    );
    this.modal.element.addEventListener("click", (event) =>
      this.handleClick(event),
    );
  }

  public async open(mode: SaveSlotMode): Promise<void> {
    this.mode = mode;
    this.selectedSlot = 0;
    this.isBusy = false;
    this.scrim.classList.remove("hidden");
    document.body.classList.add("imb-modal-open");
    this.options.onOpenChange?.(true);
    this.modal.show();
    await this.refreshSlots();
    this.focusSelectedSlot();
  }

  public close(): void {
    this.modal.hide();
  }

  public dispose(): void {
    this.modal.dispose();
    this.scrim.remove();
    document.body.classList.remove("imb-modal-open");
    this.options.onOpenChange?.(false);
  }

  private handleClosed(): void {
    this.scrim.classList.add("hidden");
    document.body.classList.remove("imb-modal-open");
    this.options.onOpenChange?.(false);
  }

  private async refreshSlots(): Promise<void> {
    this.setStatus("Loading save slots...");
    try {
      this.slots = await listSaveSlots();
      this.render();
      this.setStatus(
        this.mode === "save"
          ? "Choose a slot to save."
          : "Choose a saved game to load.",
      );
    } catch {
      this.slots = [];
      this.render();
      this.setStatus("Unable to read saved games.");
    }
  }

  private render(): void {
    const title = this.modal.element.querySelector(".imb-dialog-title");
    if (title)
      title.textContent = this.mode === "save" ? "Save Game" : "Load Game";

    const grid = this.modal.element.querySelector("#save-slot-grid");
    if (!grid) return;

    grid.innerHTML = this.slots.map((slot) => this.renderSlot(slot)).join("");
  }

  private renderSlot(slot: SaveSlotSummary): string {
    const slotLabel = `Slot ${slot.slot + 1}`;
    const occupiedClass = slot.isEmpty ? "is-empty" : "is-occupied";
    const selectedClass = slot.slot === this.selectedSlot ? "selected" : "";
    const background = slot.screenshotDataUrl
      ? ` style="--save-preview: url('${escapeAttribute(slot.screenshotDataUrl)}')"`
      : "";
    const actionLabel =
      this.mode === "save"
        ? `${slot.isEmpty ? "Save to" : "Overwrite"} ${slotLabel}`
        : `Load ${slotLabel}`;
    const disabled = this.mode === "load" && slot.isEmpty ? " disabled" : "";

    return `
      <div class="save-slot-shell ${occupiedClass} ${selectedClass}" data-save-shell="${slot.slot}">
        <button
          class="save-slot-tile"
          data-save-slot="${slot.slot}"
          type="button"
          aria-label="${escapeAttribute(actionLabel)}"
          ${disabled}
          ${background}
        >
          <span class="save-slot-number">${slotLabel}</span>
          ${slot.isEmpty ? this.renderEmptySlot() : this.renderOccupiedSlot(slot)}
        </button>
        ${
          slot.isEmpty
            ? ""
            : `
          <button
            class="save-slot-delete"
            data-delete-save-slot="${slot.slot}"
            type="button"
            title="Delete ${slotLabel}"
            aria-label="Delete ${slotLabel}"
          >X</button>
        `
        }
      </div>
    `;
  }

  private renderEmptySlot(): string {
    return `
      <span class="save-slot-empty">Empty</span>
      <span class="save-slot-hint">${this.mode === "save" ? "Save here" : "No saved game"}</span>
    `;
  }

  private renderOccupiedSlot(slot: SaveSlotSummary): string {
    return `
      <span class="save-slot-overlay">
        <span class="save-slot-character">${escapeHtml(slot.characterName ?? SAVE_CHARACTER_NAME)}</span>
        <span class="save-slot-region">${escapeHtml(slot.region ?? "Unknown Region")}</span>
        <span class="save-slot-date">${escapeHtml(formatSavedAt(slot.savedAt))}</span>
      </span>
    `;
  }

  private async handleClick(event: MouseEvent): Promise<void> {
    const target = event.target as HTMLElement;
    const deleteButton = target.closest(
      "[data-delete-save-slot]",
    ) as HTMLElement | null;
    if (deleteButton) {
      event.preventDefault();
      event.stopPropagation();
      const slot = Number.parseInt(
        deleteButton.dataset.deleteSaveSlot ?? "-1",
        10,
      );
      await this.deleteSlot(slot);
      return;
    }

    const slotButton = target.closest(
      "[data-save-slot]",
    ) as HTMLButtonElement | null;
    if (!slotButton || slotButton.disabled) return;
    const slot = Number.parseInt(slotButton.dataset.saveSlot ?? "-1", 10);
    await this.activateSlot(slot);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return;
    }

    const key = event.key.toLowerCase();
    const delta =
      key === "arrowright" || key === "d"
        ? 1
        : key === "arrowleft" || key === "a"
          ? -1
          : key === "arrowdown" || key === "s"
            ? 2
            : key === "arrowup" || key === "w"
              ? -2
              : 0;

    if (delta !== 0) {
      event.preventDefault();
      this.moveSelection(delta);
      return;
    }

    if (key === "delete" || key === "backspace") {
      const slot = this.slots.find(
        (candidate) => candidate.slot === this.selectedSlot,
      );
      if (!slot?.isEmpty) {
        event.preventDefault();
        this.deleteSlot(this.selectedSlot).catch(() => {});
      }
    }
  }

  private moveSelection(delta: number): void {
    const nextSlot =
      (this.selectedSlot + delta + SAVE_SLOT_COUNT) % SAVE_SLOT_COUNT;
    this.selectedSlot = nextSlot;
    this.syncSelection();
    this.focusSelectedSlot();
  }

  private syncSelection(): void {
    this.modal.element
      .querySelectorAll<HTMLElement>("[data-save-shell]")
      .forEach((shell) => {
        const slot = Number.parseInt(shell.dataset.saveShell ?? "-1", 10);
        shell.classList.toggle("selected", slot === this.selectedSlot);
      });
  }

  private focusSelectedSlot(): void {
    const button = this.modal.element.querySelector<HTMLButtonElement>(
      `[data-save-slot="${this.selectedSlot}"]`,
    );
    button?.focus();
  }

  private async activateSlot(slot: number): Promise<void> {
    if (this.isBusy) return;
    const summary = this.slots.find((candidate) => candidate.slot === slot);
    if (!summary) return;
    this.selectedSlot = slot;
    this.syncSelection();

    if (this.mode === "load") {
      if (summary.isEmpty) return;
      this.isBusy = true;
      this.setStatus(`Loading slot ${slot + 1}...`);
      const didLoad = await (this.options.onLoadSlot?.(slot) ??
        Promise.resolve(false));
      this.isBusy = false;
      if (didLoad) this.close();
      else this.setStatus("Unable to load that saved game.");
      return;
    }

    if (!summary.isEmpty) {
      const shouldOverwrite = window.confirm(
        `Overwrite saved game in slot ${slot + 1}?`,
      );
      if (!shouldOverwrite) return;
    }

    this.isBusy = true;
    this.setStatus(`Saving to slot ${slot + 1}...`);
    const didSave = await (this.options.onSaveSlot?.(slot) ??
      Promise.resolve(false));
    this.isBusy = false;
    if (didSave) this.close();
    else this.setStatus("Unable to save the game.");
  }

  private async deleteSlot(slot: number): Promise<void> {
    if (this.isBusy) return;
    assertValidSlot(slot);
    const summary = this.slots.find((candidate) => candidate.slot === slot);
    if (!summary || summary.isEmpty) return;
    const shouldDelete = window.confirm(
      `Delete saved game in slot ${slot + 1}?`,
    );
    if (!shouldDelete) return;

    this.isBusy = true;
    this.setStatus(`Deleting slot ${slot + 1}...`);
    const didDelete = await (this.options.onDeleteSlot?.(slot) ??
      Promise.resolve(false));
    this.isBusy = false;
    if (didDelete) {
      await this.refreshSlots();
      this.focusSelectedSlot();
    } else {
      this.setStatus("Unable to delete that saved game.");
    }
  }

  private setStatus(message: string): void {
    const status = this.modal.element.querySelector("#save-slot-status");
    if (status) status.textContent = message;
  }
}

function formatSavedAt(savedAt?: string): string {
  if (!savedAt) return "Unknown date";
  const timestamp = Date.parse(savedAt);
  if (!Number.isFinite(timestamp)) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(str: string): string {
  return escapeHtml(str).replace(/'/g, "&#39;");
}
