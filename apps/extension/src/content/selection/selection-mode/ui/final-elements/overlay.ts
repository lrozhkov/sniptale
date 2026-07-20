import type { FinalElementsOptions } from './types';

export function createSelectionModeFinalOverlay(options: FinalElementsOptions): HTMLElement {
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

function createEventCatcher(options: FinalElementsOptions): HTMLElement {
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
