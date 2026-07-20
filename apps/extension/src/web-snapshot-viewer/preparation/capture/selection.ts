import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';

type ViewerSelectionOverlay = {
  box: HTMLDivElement;
  host: HTMLDivElement;
};

type SelectionDraft = {
  active: boolean;
  startX: number;
  startY: number;
};

type SelectionPromiseArgs = {
  draft: SelectionDraft;
  overlay: ViewerSelectionOverlay;
  rect: DOMRect;
};

type SelectionHandlers = {
  handleKeyDown: (event: KeyboardEvent) => void;
  handlePointerDown: (event: PointerEvent) => void;
  handlePointerMove: (event: PointerEvent) => void;
  handlePointerUp: (event: PointerEvent) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createSelectionOverlay(rect: DOMRect): ViewerSelectionOverlay {
  const host = document.createElement('div');
  const box = document.createElement('div');

  host.dataset['sniptaleViewerSelectionOverlay'] = 'true';
  host.style.cssText = [
    'position:fixed',
    `left:${rect.left}px`,
    `top:${rect.top}px`,
    `width:${rect.width}px`,
    `height:${rect.height}px`,
    'z-index:2147483646',
    'cursor:crosshair',
    'background:rgba(17,24,39,0.08)',
  ].join(';');
  box.style.cssText = [
    'position:absolute',
    'border:2px solid #f97316',
    'background:rgba(249,115,22,0.12)',
    'box-sizing:border-box',
    'pointer-events:none',
  ].join(';');
  host.appendChild(box);
  document.body.appendChild(host);
  return { box, host };
}

function updateSelectionBox(overlay: ViewerSelectionOverlay, area: CaptureArea): void {
  overlay.box.style.left = `${area.x}px`;
  overlay.box.style.top = `${area.y}px`;
  overlay.box.style.width = `${area.width}px`;
  overlay.box.style.height = `${area.height}px`;
}

function resolveAreaFromEvent(args: {
  draft: SelectionDraft;
  event: PointerEvent;
  rect: DOMRect;
}): CaptureArea {
  const x = clamp(args.event.clientX - args.rect.left, 0, args.rect.width);
  const y = clamp(args.event.clientY - args.rect.top, 0, args.rect.height);
  const left = Math.min(args.draft.startX, x);
  const top = Math.min(args.draft.startY, y);

  return {
    height: Math.abs(y - args.draft.startY),
    width: Math.abs(x - args.draft.startX),
    x: left,
    y: top,
  };
}

function removeSelectionOverlay(overlay: ViewerSelectionOverlay): void {
  overlay.host.remove();
}

export function requestViewerSelectionArea(iframe: HTMLIFrameElement): Promise<CaptureArea> {
  const rect = iframe.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return Promise.reject(new Error('Web snapshot viewer surface is not visible for selection.'));
  }

  const overlay = createSelectionOverlay(rect);
  const draft: SelectionDraft = { active: false, startX: 0, startY: 0 };
  return createSelectionPromise({ draft, overlay, rect });
}

function addSelectionListeners(args: SelectionPromiseArgs, handlers: SelectionHandlers): void {
  args.overlay.host.addEventListener('pointerdown', handlers.handlePointerDown);
  args.overlay.host.addEventListener('pointermove', handlers.handlePointerMove);
  args.overlay.host.addEventListener('pointerup', handlers.handlePointerUp);
  document.addEventListener('keydown', handlers.handleKeyDown, true);
}

function removeSelectionListeners(args: SelectionPromiseArgs, handlers: SelectionHandlers): void {
  args.overlay.host.removeEventListener('pointerdown', handlers.handlePointerDown);
  args.overlay.host.removeEventListener('pointermove', handlers.handlePointerMove);
  args.overlay.host.removeEventListener('pointerup', handlers.handlePointerUp);
  document.removeEventListener('keydown', handlers.handleKeyDown, true);
}

function createSelectionHandlers(
  args: SelectionPromiseArgs,
  callbacks: {
    cleanup: () => void;
    rejectCancelled: () => void;
    resolve: (area: CaptureArea) => void;
  }
): SelectionHandlers {
  const handlePointerDown = (event: PointerEvent) => {
    event.preventDefault();
    args.draft.active = true;
    args.draft.startX = clamp(event.clientX - args.rect.left, 0, args.rect.width);
    args.draft.startY = clamp(event.clientY - args.rect.top, 0, args.rect.height);
    updateSelectionBox(args.overlay, {
      height: 0,
      width: 0,
      x: args.draft.startX,
      y: args.draft.startY,
    });
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (args.draft.active) {
      updateSelectionBox(
        args.overlay,
        resolveAreaFromEvent({ draft: args.draft, event, rect: args.rect })
      );
    }
  };

  return {
    handleKeyDown: (event) => handleSelectionKeyDown(event, callbacks.rejectCancelled),
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: (event) => handleSelectionPointerUp(event, args, callbacks),
  };
}

function handleSelectionKeyDown(event: KeyboardEvent, rejectCancelled: () => void): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    rejectCancelled();
  }
}

function handleSelectionPointerUp(
  event: PointerEvent,
  args: SelectionPromiseArgs,
  callbacks: {
    cleanup: () => void;
    rejectCancelled: () => void;
    resolve: (area: CaptureArea) => void;
  }
): void {
  if (!args.draft.active) {
    return;
  }

  const area = resolveAreaFromEvent({ draft: args.draft, event, rect: args.rect });
  if (area.width < 1 || area.height < 1) {
    callbacks.rejectCancelled();
    return;
  }

  callbacks.cleanup();
  callbacks.resolve(area);
}

function createSelectionPromise(args: SelectionPromiseArgs): Promise<CaptureArea> {
  return new Promise((resolve, reject) => {
    let handlers: SelectionHandlers;
    const cleanup = () => {
      removeSelectionListeners(args, handlers);
      removeSelectionOverlay(args.overlay);
    };
    const rejectCancelled = () => {
      cleanup();
      reject(new Error('Web snapshot viewer selection capture was cancelled.'));
    };
    handlers = createSelectionHandlers(args, { cleanup, rejectCancelled, resolve });
    addSelectionListeners(args, handlers);
  });
}
