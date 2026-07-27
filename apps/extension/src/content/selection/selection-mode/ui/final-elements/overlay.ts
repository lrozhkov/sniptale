import type { SelectionModeFinalElementsOptions, SelectionRect } from '../types';

const dragMaskContexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D | null>();
const DEFAULT_DRAG_MASK_BACKGROUND = 'rgba(0, 0, 0, 0.45)';

export function resolveSelectionModeDragMaskBackground(
  owner: HTMLElement,
  overlayBackground: string
): string {
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = `
    position: fixed;
    width: 0;
    height: 0;
    visibility: hidden;
    pointer-events: none;
    background: ${overlayBackground};
  `;
  owner.appendChild(probe);

  try {
    const resolvedBackground = getComputedStyle(probe).backgroundColor;
    return resolvedBackground && !resolvedBackground.includes('var(')
      ? resolvedBackground
      : DEFAULT_DRAG_MASK_BACKGROUND;
  } finally {
    probe.remove();
  }
}

export function createSelectionModeFinalOverlay(
  options: SelectionModeFinalElementsOptions
): HTMLElement {
  const finalOverlay = document.createElement('div');
  finalOverlay.className = 'sniptale-selection-final-overlay';
  finalOverlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    background: transparent;
  `;

  for (const direction of ['top', 'bottom', 'left', 'right']) {
    finalOverlay.appendChild(createShade(direction, options.overlayBackground));
  }

  finalOverlay.appendChild(createEventCatcher(options));
  return finalOverlay;
}

export function createSelectionModeDragOverlay(overlayBackground: string): HTMLCanvasElement {
  const dragOverlay = document.createElement('canvas');
  dragOverlay.className = 'sniptale-selection-drag-overlay';
  dragOverlay.dataset['overlayBackground'] = overlayBackground;
  dragOverlay.setAttribute('aria-hidden', 'true');
  dragOverlay.style.cssText = `
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    display: none;
    contain: strict;
  `;
  return dragOverlay;
}

function clampCanvasCoordinate(value: number, maximum: number): number {
  return Math.min(Math.max(value, 0), maximum);
}

function ensureDragMaskContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  if (dragMaskContexts.has(canvas)) return dragMaskContexts.get(canvas) ?? null;
  const context = canvas.getContext('2d');
  dragMaskContexts.set(canvas, context);
  return context;
}

export function paintSelectionModeDragMask(canvas: HTMLCanvasElement, rect: SelectionRect): void {
  const viewportWidth = Math.max(1, Math.round(window.innerWidth));
  const viewportHeight = Math.max(1, Math.round(window.innerHeight));
  if (canvas.width !== viewportWidth) canvas.width = viewportWidth;
  if (canvas.height !== viewportHeight) canvas.height = viewportHeight;

  const context = ensureDragMaskContext(canvas);
  if (!context) return;

  const left = clampCanvasCoordinate(rect.x, viewportWidth);
  const top = clampCanvasCoordinate(rect.y, viewportHeight);
  const right = clampCanvasCoordinate(rect.x + rect.width, viewportWidth);
  const bottom = clampCanvasCoordinate(rect.y + rect.height, viewportHeight);
  const selectionHeight = Math.max(0, bottom - top);

  context.clearRect(0, 0, viewportWidth, viewportHeight);
  context.fillStyle = canvas.dataset['overlayBackground'] ?? DEFAULT_DRAG_MASK_BACKGROUND;
  context.fillRect(0, 0, viewportWidth, top);
  context.fillRect(0, bottom, viewportWidth, viewportHeight - bottom);
  context.fillRect(0, top, left, selectionHeight);
  context.fillRect(right, top, viewportWidth - right, selectionHeight);
}

function createShade(direction: string, overlayBackground: string): HTMLElement {
  const shade = document.createElement('div');
  shade.className = `sniptale-shade sniptale-shade-${direction}`;
  shade.style.cssText = `
    position: absolute;
    background: ${overlayBackground};
    pointer-events: none;
  `;

  if (direction === 'top') {
    shade.style.cssText += 'top: 0; left: 0; right: 0;';
  } else if (direction === 'bottom') {
    shade.style.cssText += 'left: 0; right: 0; bottom: 0;';
  } else if (direction === 'left') {
    shade.style.cssText += 'top: 0; bottom: 0; left: 0;';
  } else {
    shade.style.cssText += 'top: 0; bottom: 0; right: 0;';
  }

  return shade;
}

function createEventCatcher(options: SelectionModeFinalElementsOptions): HTMLElement {
  const eventCatcher = document.createElement('div');
  eventCatcher.className = 'sniptale-selection-event-catcher';
  eventCatcher.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: auto;
    cursor: crosshair;
    z-index: ${options.zIndexBase - 1};
  `;
  eventCatcher.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onResetToIdle();
  });
  return eventCatcher;
}
