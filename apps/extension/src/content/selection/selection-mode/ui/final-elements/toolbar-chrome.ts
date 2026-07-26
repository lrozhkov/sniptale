import type { ContentSizeTooltipDom } from '@sniptale/ui/content-size-tooltip/dom';

type SelectionToolbarButtonChromeOptions = {
  active?: boolean;
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

/** Adapts the imperative selection surface to the shared content-toolbar visual contract. */
export function applySelectionToolbarSurfaceChrome(root: HTMLElement): void {
  root.classList.add(
    'sniptale-glass-toolbar',
    'sniptale-toolbar-root',
    'sniptale-selection-toolbar'
  );
  SURFACE_INLINE_CHROME_PROPERTIES.forEach((property) => root.style.removeProperty(property));
  root.style.width = 'max-content';
  root.style.minWidth = '0';
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
  button.classList.toggle('sniptale-glass-toolbar-button--active', options.active === true);

  if (options.active) button.dataset['active'] = 'true';
  else delete button.dataset['active'];

  if (options.labelled) {
    button.style.width = 'auto';
    button.style.minWidth = '36px';
    button.style.padding = '0 10px';
    button.style.gap = '6px';
  }

  if (options.split === 'start') {
    button.style.borderRadius = 'var(--sniptale-radius-md) 0 0 var(--sniptale-radius-md)';
  } else if (options.split === 'end') {
    button.style.width = '28px';
    button.style.minWidth = '28px';
    button.style.borderRadius = '0 var(--sniptale-radius-md) var(--sniptale-radius-md) 0';
  } else {
    button.style.borderRadius = 'var(--sniptale-radius-md)';
  }
}

export function applySelectionToolbarCompactButtonChrome(button: HTMLButtonElement): void {
  applySelectionToolbarButtonChrome(button, {
    active: button.getAttribute('aria-pressed') === 'true',
    preserveLayout: true,
  });
}

export function syncSelectionToolbarCompactControlsChrome(tooltip: ContentSizeTooltipDom): void {
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
