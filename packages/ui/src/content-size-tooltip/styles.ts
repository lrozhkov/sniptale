import { CONTENT_SIZE_TOOLTIP_DIMENSIONS } from './core';

type StyleRecord = Record<string, string | number>;

function mergeStyleRecords(...styles: Array<StyleRecord | null | undefined>): StyleRecord {
  const merged: StyleRecord = {};
  for (const style of styles) {
    if (style) {
      Object.assign(merged, style);
    }
  }

  return merged;
}

export const CONTENT_SIZE_TOOLTIP_INPUT_CLASS_NAME = 'sniptale-content-size-tooltip-input';
export const CONTENT_SIZE_TOOLTIP_STEPPER_CLASS_NAME = 'sniptale-content-size-tooltip-stepper';
export const CONTENT_SIZE_TOOLTIP_STEPPER_CONTROLS_CLASS_NAME =
  'sniptale-content-size-tooltip-stepper-controls';

export const CONTENT_SIZE_TOOLTIP_INPUT_STYLE_TEXT = `
  .${CONTENT_SIZE_TOOLTIP_INPUT_CLASS_NAME}::-webkit-inner-spin-button,
  .${CONTENT_SIZE_TOOLTIP_INPUT_CLASS_NAME}::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .${CONTENT_SIZE_TOOLTIP_INPUT_CLASS_NAME} {
    -moz-appearance: textfield;
  }

  .${CONTENT_SIZE_TOOLTIP_STEPPER_CONTROLS_CLASS_NAME} .sniptale-size-btn {
    opacity: 0;
    pointer-events: none;
  }

  .${CONTENT_SIZE_TOOLTIP_STEPPER_CLASS_NAME}:hover
    .${CONTENT_SIZE_TOOLTIP_STEPPER_CONTROLS_CLASS_NAME} .sniptale-size-btn:not(:disabled) {
    opacity: 1;
    pointer-events: auto;
  }

  .${CONTENT_SIZE_TOOLTIP_STEPPER_CLASS_NAME}:focus-within
    .${CONTENT_SIZE_TOOLTIP_STEPPER_CONTROLS_CLASS_NAME} .sniptale-size-btn {
    opacity: 0;
    pointer-events: none;
  }
`;

export const CONTENT_SIZE_TOOLTIP_SURFACE_STYLE: StyleRecord = {
  position: 'fixed',
  display: 'inline-flex',
  alignItems: 'center',
  flexWrap: 'nowrap',
  gap: '6px',
  whiteSpace: 'nowrap',
  minWidth: `${CONTENT_SIZE_TOOLTIP_DIMENSIONS.width}px`,
  maxWidth: 'calc(100vw - 24px)',
  padding: '6px',
  border: '1px solid color-mix(in srgb, var(--sniptale-color-border-soft) 88%, transparent)',
  borderRadius: '12px',
  background: 'color-mix(in srgb, var(--sniptale-color-surface-panel) 96%, transparent)',
  boxShadow: [
    '0 14px 28px color-mix(in srgb, var(--sniptale-color-shadow-strong) 14%, transparent)',
    'inset 0 1px 0 color-mix(in srgb, var(--sniptale-color-border-strong) 18%, transparent)',
  ].join(', '),
  pointerEvents: 'auto',
  zIndex: 2147483647,
  boxSizing: 'border-box',
};

export const CONTENT_SIZE_TOOLTIP_STEPPER_STYLE: StyleRecord = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  width: '82px',
  height: '32px',
};

export const CONTENT_SIZE_TOOLTIP_STEPPER_CONTROLS_STYLE: StyleRecord = {
  position: 'absolute',
  top: '2px',
  right: '5px',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
};

export const CONTENT_SIZE_TOOLTIP_DIVIDER_STYLE: StyleRecord = {
  width: '1px',
  height: '22px',
  alignSelf: 'center',
  background: 'color-mix(in srgb, var(--sniptale-color-border-soft) 70%, transparent)',
};

const CONTENT_SIZE_TOOLTIP_BUTTON_BASE_STYLE: StyleRecord = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '8px',
  border: '1px solid color-mix(in srgb, var(--sniptale-color-border-soft) 86%, transparent)',
  borderTopColor: 'color-mix(in srgb, var(--sniptale-color-border-strong) 42%, transparent)',
  color: 'var(--sniptale-color-text-muted)',
  background: 'color-mix(in srgb, var(--sniptale-color-surface-panel) 82%, transparent)',
  cursor: 'pointer',
  lineHeight: 0,
  transition:
    'background 120ms ease, color 120ms ease, border-color 120ms ease, opacity 120ms ease, transform 120ms ease',
};

const CONTENT_SIZE_TOOLTIP_STEPPER_BUTTON_STYLE: StyleRecord = {
  ...CONTENT_SIZE_TOOLTIP_BUTTON_BASE_STYLE,
  width: '22px',
  height: '13px',
  padding: '0',
};

export const CONTENT_SIZE_TOOLTIP_INPUT_STYLE: StyleRecord = {
  width: '100%',
  height: '32px',
  padding: '0 34px 0 10px',
  border: '1px solid color-mix(in srgb, var(--sniptale-color-border-soft) 86%, transparent)',
  borderRadius: '10px',
  background: [
    'linear-gradient(180deg,',
    'color-mix(in srgb, var(--sniptale-color-surface-input) 96%, transparent),',
    'color-mix(in srgb, var(--sniptale-color-surface-input) 82%, transparent))',
  ].join(' '),
  color: 'var(--sniptale-color-text-primary)',
  fontSize: '12px',
  fontWeight: 650,
  textAlign: 'left',
  fontVariantNumeric: 'tabular-nums',
  outline: 'none',
  boxSizing: 'border-box',
};

const CONTENT_SIZE_TOOLTIP_RATIO_BUTTON_STYLE: StyleRecord = {
  ...CONTENT_SIZE_TOOLTIP_BUTTON_BASE_STYLE,
  width: '30px',
  height: '32px',
  padding: '0',
};

export const CONTENT_SIZE_TOOLTIP_ACTIONS_STYLE: StyleRecord = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
};

const CONTENT_SIZE_TOOLTIP_ACTION_BUTTON_STYLE: StyleRecord = {
  minWidth: '72px',
  height: '32px',
  padding: '0 10px',
  borderRadius: '10px',
  fontSize: '12px',
  fontWeight: 650,
  border: '1px solid color-mix(in srgb, var(--sniptale-color-border-soft) 88%, transparent)',
  cursor: 'pointer',
  transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
};

export function getContentSizeTooltipActionButtonStyle(tone: 'neutral' | 'accent'): StyleRecord {
  if (tone === 'accent') {
    return {
      ...CONTENT_SIZE_TOOLTIP_ACTION_BUTTON_STYLE,
      border: '1px solid color-mix(in srgb, var(--sniptale-color-accent) 28%, transparent)',
      background:
        'color-mix(in srgb, var(--sniptale-color-accent) 9%, var(--sniptale-color-surface-hover) 91%)',
      color: 'var(--sniptale-color-text-primary-strong)',
    };
  }

  return {
    ...CONTENT_SIZE_TOOLTIP_ACTION_BUTTON_STYLE,
    background: 'color-mix(in srgb, var(--sniptale-color-surface-hover) 58%, transparent)',
    color: 'var(--sniptale-color-text-primary)',
  };
}

export function getContentSizeTooltipRatioButtonStyle(params: {
  active: boolean;
  disabled?: boolean;
}): StyleRecord {
  if (params.disabled) {
    return mergeStyleRecords(CONTENT_SIZE_TOOLTIP_RATIO_BUTTON_STYLE, {
      opacity: 0.42,
      cursor: 'default',
    });
  }

  if (params.active) {
    return mergeStyleRecords(CONTENT_SIZE_TOOLTIP_RATIO_BUTTON_STYLE, {
      border: '1px solid color-mix(in srgb, var(--sniptale-color-accent) 30%, transparent)',
      background:
        'color-mix(in srgb, var(--sniptale-color-accent) 9%, var(--sniptale-color-surface-hover) 91%)',
      color: 'var(--sniptale-color-text-primary-strong)',
    });
  }

  return CONTENT_SIZE_TOOLTIP_RATIO_BUTTON_STYLE;
}

export function getContentSizeTooltipStepButtonStyle(disabled: boolean): StyleRecord {
  if (!disabled) {
    return CONTENT_SIZE_TOOLTIP_STEPPER_BUTTON_STYLE;
  }

  return mergeStyleRecords(CONTENT_SIZE_TOOLTIP_STEPPER_BUTTON_STYLE, {
    cursor: 'default',
  });
}
