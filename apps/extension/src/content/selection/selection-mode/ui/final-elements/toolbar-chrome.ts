import type { ContentSizeTooltipDom } from '@sniptale/ui/content-size-tooltip/dom';

type SelectionToolbarButtonChromeOptions = {
  labelled?: boolean;
  preserveLayout?: boolean;
  split?: 'start' | 'end';
};

const SURFACE_INLINE_CHROME_PROPERTIES = [
  'background',
  'border',
  'border-radius',
  'box-shadow',
  'gap',
  'min-height',
  'padding',
] as const;

const BUTTON_INLINE_CHROME_PROPERTIES = [
  'background',
  'border',
  'border-top-color',
  'border-radius',
  'box-shadow',
  'color',
  'transition',
] as const;

const pointerFocusRoots = new WeakSet<HTMLElement>();

function getPointerButton(event: MouseEvent, root: HTMLElement): HTMLButtonElement | null {
  if (event.button !== 0 || !(event.target instanceof Element)) return null;
  const button = event.target.closest<HTMLButtonElement>('button');
  return button && root.contains(button) && !button.disabled ? button : null;
}

function installPointerFocusPolicy(root: HTMLElement): void {
  if (pointerFocusRoots.has(root)) return;
  pointerFocusRoots.add(root);
  root.addEventListener(
    'pointerdown',
    (event) => {
      const button = getPointerButton(event, root);
      if (button?.matches(':focus')) button.blur();
    },
    true
  );
  root.addEventListener(
    'mousedown',
    (event) => {
      if (!getPointerButton(event, root)) return;
      const tree = root.getRootNode();
      const focused = tree instanceof ShadowRoot ? tree.activeElement : document.activeElement;
      if (
        focused instanceof HTMLElement &&
        root.contains(focused) &&
        focused.matches('input, textarea, [contenteditable="true"]')
      )
        focused.blur();
      event.preventDefault();
    },
    true
  );
}

/** Adapts the imperative selection surface to the shared content-toolbar visual contract. */
export function applySelectionToolbarSurfaceChrome(root: HTMLElement): void {
  root.classList.add(
    'sniptale-glass-toolbar',
    'sniptale-toolbar-root',
    'sniptale-content-toolbar-adopted',
    'sniptale-selection-toolbar'
  );
  SURFACE_INLINE_CHROME_PROPERTIES.forEach((property) => root.style.removeProperty(property));
  root.style.width = 'max-content';
  root.style.minWidth = '0';
  installPointerFocusPolicy(root);
}

/** Removes legacy inline chrome so shared glass-button states remain the visual authority. */
export function applySelectionToolbarButtonChrome(
  button: HTMLButtonElement,
  options: SelectionToolbarButtonChromeOptions = {}
): void {
  if (options.preserveLayout) {
    BUTTON_INLINE_CHROME_PROPERTIES.forEach((property) => button.style.removeProperty(property));
  } else {
    button.removeAttribute('style');
  }
  button.classList.add('sniptale-glass-toolbar-button');
  button.classList.remove('sniptale-glass-toolbar-button--active');
  button.classList.remove('sniptale-split-action-start', 'sniptale-split-action-end');
  delete button.dataset['active'];

  if (options.labelled) {
    button.style.width = 'auto';
    button.style.minWidth = '36px';
    button.style.padding = '0 10px';
    button.style.gap = '6px';
  }

  if (options.split === 'start') {
    button.classList.add('sniptale-split-action-start');
  } else if (options.split === 'end') {
    button.style.width = '18px';
    button.style.minWidth = '18px';
    button.classList.add('sniptale-split-action-end');
  } else {
    button.style.borderRadius = 'var(--sniptale-radius)';
  }
}

export function applySelectionToolbarCompactButtonChrome(button: HTMLButtonElement): void {
  applySelectionToolbarButtonChrome(button, {
    preserveLayout: true,
  });
}

export function syncSelectionToolbarCompactControlsChrome(tooltip: ContentSizeTooltipDom): void {
  [tooltip.widthInput, tooltip.heightInput].forEach((input) => {
    input.style.removeProperty('padding');
    input.parentElement?.style.removeProperty('width');
  });
  applySelectionToolbarCompactButtonChrome(tooltip.aspectRatioButton);
  [
    tooltip.widthDecreaseButton,
    tooltip.widthIncreaseButton,
    tooltip.heightDecreaseButton,
    tooltip.heightIncreaseButton,
  ].forEach(applySelectionToolbarCompactButtonChrome);
}

export function applySelectionToolbarDividerChrome(divider: Element): void {
  divider.removeAttribute('style');
  divider.classList.add('sniptale-glass-toolbar-divider');
}

export function createSelectionToolbarDivider(): HTMLElement {
  const divider = document.createElement('span');
  divider.setAttribute('aria-hidden', 'true');
  applySelectionToolbarDividerChrome(divider);
  return divider;
}
