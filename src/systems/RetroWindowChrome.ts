type ResizeEdge =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MIN_WINDOW_WIDTH = 960;
const MIN_WINDOW_HEIGHT = 640;

/**
 * Connects the custom retro window chrome to Electron window controls.
 */
export class RetroWindowChrome {
  private activeResize:
    | {
        edge: ResizeEdge;
        startScreenX: number;
        startScreenY: number;
        startBounds: WindowBounds;
      }
    | null = null;
  private suppressNextClick = false;

  constructor() {
    this.attachWindowControls();
    this.attachTitlebarControls();
    this.attachFullscreenListeners();
    this.attachResizeHandles();
    this.attachKeyboardShortcuts();
  }

  public showGameChrome(): void {
    document.body.classList.add("game-window-active");
  }

  public async transitionFromIntro(): Promise<boolean> {
    const didCreateGameWindow = await window.native?.setGameWindowOpaque?.();
    if (didCreateGameWindow) return true;

    this.showGameChrome();
    return false;
  }

  private attachWindowControls(): void {
    this.attachButtonControl("retro-btn-close", () =>
      window.native?.closeWindow?.(),
    );
    this.attachButtonControl("retro-btn-minimize", () =>
      window.native?.minimizeWindow?.(),
    );
    this.attachButtonControl("retro-btn-fullscreen", () =>
      window.native?.toggleFullscreen?.(),
    );
  }

  private attachButtonControl(id: string, action: () => void): void {
    const button = document.getElementById(id);
    if (!button) return;

    button.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.suppressNextClick = true;
      action();
    });

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.suppressNextClick) {
        this.suppressNextClick = false;
        return;
      }
      action();
    });
  }

  private attachTitlebarControls(): void {
    document
      .querySelector<HTMLElement>(".retro-titlebar")
      ?.addEventListener("dblclick", (event) => {
        event.preventDefault();
        window.native?.toggleMaximize?.();
      });
  }

  private attachFullscreenListeners(): void {
    window.native?.onEnterFullscreen?.(() => {
      document.body.classList.add("is-fullscreen");
    });
    window.native?.onLeaveFullscreen?.(() => {
      document.body.classList.remove("is-fullscreen");
    });
  }

  private attachResizeHandles(): void {
    document
      .querySelectorAll<HTMLElement>(".resize-handle")
      .forEach((handle) => {
        const edge = handle.dataset.edge as ResizeEdge | undefined;
        if (!edge) return;

        handle.addEventListener("pointerdown", (event) => {
          this.startResize(edge, event);
        });
      });
  }

  private attachKeyboardShortcuts(): void {
    document.addEventListener("keydown", (event) => {
      if (!document.body.classList.contains("is-fullscreen")) return;
      if (event.key !== "Escape") return;

      event.preventDefault();
      window.native?.toggleFullscreen?.();
    });
  }

  private async startResize(
    edge: ResizeEdge,
    event: PointerEvent,
  ): Promise<void> {
    if (event.button !== 0) return;

    const startBounds = await window.native?.getWindowBounds?.();
    if (!startBounds) return;

    event.preventDefault();
    this.activeResize = {
      edge,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      startBounds,
    };

    window.addEventListener("pointermove", this.onResizeMove);
    window.addEventListener("pointerup", this.stopResize, { once: true });
    window.addEventListener("pointercancel", this.stopResize, { once: true });
  }

  private readonly onResizeMove = (event: PointerEvent): void => {
    if (!this.activeResize) return;

    event.preventDefault();
    const dx = event.screenX - this.activeResize.startScreenX;
    const dy = event.screenY - this.activeResize.startScreenY;
    const nextBounds = this.getNextBounds(this.activeResize, dx, dy);
    window.native?.setWindowBounds?.(nextBounds);
  };

  private readonly stopResize = (): void => {
    this.activeResize = null;
    window.removeEventListener("pointermove", this.onResizeMove);
  };

  private getNextBounds(
    resize: NonNullable<RetroWindowChrome["activeResize"]>,
    dx: number,
    dy: number,
  ): WindowBounds {
    const start = resize.startBounds;
    const right = start.x + start.width;
    const bottom = start.y + start.height;
    const next: WindowBounds = { ...start };

    if (resize.edge.includes("left")) {
      next.x = Math.min(start.x + dx, right - MIN_WINDOW_WIDTH);
      next.width = right - next.x;
    }

    if (resize.edge.includes("right")) {
      next.width = Math.max(MIN_WINDOW_WIDTH, start.width + dx);
    }

    if (resize.edge.includes("top")) {
      next.y = Math.min(start.y + dy, bottom - MIN_WINDOW_HEIGHT);
      next.height = bottom - next.y;
    }

    if (resize.edge.includes("bottom")) {
      next.height = Math.max(MIN_WINDOW_HEIGHT, start.height + dy);
    }

    return next;
  }
}
