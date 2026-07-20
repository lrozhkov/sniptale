const REGION_SELECTOR_HANDLE_SURFACE = [
  'position: absolute; width: 12px; height: 12px;',
  'background: color-mix(in srgb, var(--sniptale-color-accent-soft) 18%, var(--sniptale-color-surface-panel) 82%);',
  'border: 1px solid color-mix(in srgb, var(--sniptale-color-accent) 24%, var(--sniptale-color-border-soft) 76%);',
  [
    'box-shadow: 0 0 0 1px var(--sniptale-color-surface-base), 0 8px 18px ',
    'color-mix(in srgb, var(--sniptale-color-overlay) 12%, transparent);',
  ].join(''),
  'border-radius: 50%;',
].join(' ');

export const REGION_SELECTOR_RESIZE_HANDLES = [
  {
    corner: 'nw',
    style: `${REGION_SELECTOR_HANDLE_SURFACE} top: -6px; left: -6px; cursor: nw-resize;`,
  },
  {
    corner: 'ne',
    style: `${REGION_SELECTOR_HANDLE_SURFACE} top: -6px; right: -6px; cursor: ne-resize;`,
  },
  {
    corner: 'sw',
    style: `${REGION_SELECTOR_HANDLE_SURFACE} bottom: -6px; left: -6px; cursor: sw-resize;`,
  },
  {
    corner: 'se',
    style: `${REGION_SELECTOR_HANDLE_SURFACE} bottom: -6px; right: -6px; cursor: se-resize;`,
  },
] as const;

export const REGION_SELECTOR_BADGE_SURFACE_STYLE =
  'background: color-mix(in srgb, var(--sniptale-color-surface-panel) 92%, var(--sniptale-color-surface-canvas) 8%);' +
  ' color: var(--sniptale-color-text-primary); border: 1px solid var(--sniptale-color-border-soft);' +
  ' box-shadow: 0 12px 24px color-mix(in srgb, var(--sniptale-color-overlay) 12%, transparent);';

export const REGION_SELECTOR_INSTRUCTION_STYLE =
  'position: absolute; top: 18px; left: 50%; transform: translateX(-50%); padding: 8px 16px;' +
  ` border-radius: 12px; font-size: 14px; ${REGION_SELECTOR_BADGE_SURFACE_STYLE}`;

export const REGION_SELECTOR_MASK_STYLE =
  'position: absolute; background: color-mix(in srgb, var(--sniptale-color-overlay) 72%, transparent);';

export const REGION_SELECTOR_SURFACE_STYLE =
  [
    'position: absolute;',
    'border: 2px solid color-mix(in srgb, var(--sniptale-color-accent) 56%, var(--sniptale-color-border-soft) 44%);',
  ].join(' ') +
  ' box-shadow: 0 0 0 1px color-mix(in srgb, var(--sniptale-color-accent) 6%, transparent);' +
  ' cursor: grab; box-sizing: border-box;';

export const REGION_SELECTOR_OVERLAY_STYLE =
  'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: transparent; cursor: crosshair;';
