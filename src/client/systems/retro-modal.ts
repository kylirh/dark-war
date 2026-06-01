/**
 * Reusable retro system modal window.
 */

export interface RetroModalOptions {
  id: string;
  title: string;
  body: string;
  initialPosition: { top: number; left: number };
  className?: string;
  centerOnOpen?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
}

export class RetroModal {
  public readonly element: HTMLElement;
  private readonly titlebar: HTMLElement;
  private readonly onClose: () => void;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private isDragging = false;
  private readonly onMouseMove = (event: MouseEvent): void =>
    this.handleMouseMove(event);
  private readonly onMouseUp = (): void => this.stopDrag();

  constructor(options: RetroModalOptions) {
    this.onClose = options.onClose ?? (() => {});
    this.element = document.createElement("div");
    this.element.id = options.id;
    this.element.className =
      `imb-dialog hidden ${options.className ?? ""}`.trim();
    this.element.dataset.centerOnOpen = String(options.centerOnOpen ?? false);
    this.element.style.top = `${options.initialPosition.top}px`;
    this.element.style.left = `${options.initialPosition.left}px`;
    this.element.innerHTML = `
      <div class="imb-dialog-titlebar" data-drag-handle="true">
        <button
          class="imb-dialog-close retro-window-button retro-window-button-close"
          data-close="${options.id}"
          type="button"
          title="Close"
          aria-label="Close ${options.title}"
        >
          <span>X</span>
        </button>
        <div class="imb-dialog-stripes"></div>
        <span class="imb-dialog-title">${options.title}</span>
        <div class="imb-dialog-stripes"></div>
      </div>
      <div class="imb-dialog-body">${options.body}</div>
    `;

    this.titlebar = this.element.querySelector(".imb-dialog-titlebar")!;
    this.titlebar.addEventListener("mousedown", (event) =>
      this.startDrag(event),
    );
    this.element
      .querySelector("[data-close]")
      ?.addEventListener("click", () => this.hide());
    this.element.addEventListener("mousedown", () => this.bringToFront());

    if (options.onOpen) {
      this.element.addEventListener("retro-modal-open", options.onOpen);
    }
  }

  public show(): void {
    this.element.classList.remove("hidden");
    if (this.element.dataset.centerOnOpen === "true") this.centerInViewport();
    this.clampToViewport();
    this.bringToFront();
    this.element.dispatchEvent(new CustomEvent("retro-modal-open"));
  }

  public hide(): void {
    if (this.element.classList.contains("hidden")) return;
    this.element.classList.add("hidden");
    this.stopDrag();
    this.onClose();
  }

  public isOpen(): boolean {
    return !this.element.classList.contains("hidden");
  }

  public dispose(): void {
    this.stopDrag();
    this.element.remove();
  }

  public bringToFront(): void {
    RetroModalZIndex.current += 1;
    this.element.style.zIndex = String(RetroModalZIndex.current);
  }

  private startDrag(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest("button")) return;
    const rect = this.element.getBoundingClientRect();
    this.dragOffsetX = event.clientX - rect.left;
    this.dragOffsetY = event.clientY - rect.top;
    this.isDragging = true;
    this.bringToFront();
    this.element.classList.add("dragging");
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mouseup", this.onMouseUp);
    event.preventDefault();
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.isDragging) return;
    const maxLeft = window.innerWidth - this.element.offsetWidth - 8;
    const maxTop = window.innerHeight - this.element.offsetHeight - 8;
    this.element.style.left = `${Math.min(Math.max(8, event.clientX - this.dragOffsetX), Math.max(8, maxLeft))}px`;
    this.element.style.top = `${Math.min(Math.max(8, event.clientY - this.dragOffsetY), Math.max(8, maxTop))}px`;
  }

  private stopDrag(): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.element.classList.remove("dragging");
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
  }

  private clampToViewport(): void {
    const rect = this.element.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
    const currentLeft = Number.parseFloat(this.element.style.left) || rect.left;
    const currentTop = Number.parseFloat(this.element.style.top) || rect.top;
    this.element.style.left = `${Math.min(Math.max(8, currentLeft), maxLeft)}px`;
    this.element.style.top = `${Math.min(Math.max(8, currentTop), maxTop)}px`;
  }

  private centerInViewport(): void {
    const rect = this.element.getBoundingClientRect();
    this.element.style.left = `${Math.max(8, (window.innerWidth - rect.width) / 2)}px`;
    this.element.style.top = `${Math.max(8, (window.innerHeight - rect.height) / 2)}px`;
  }
}

class RetroModalZIndex {
  public static current = 10000;
}
