import {
  CONTENT_SIZE_TOOLTIP_DIMENSIONS,
  CONTENT_SIZE_TOOLTIP_FRAME_EDIT_DIMENSIONS,
} from './core';
import type { ContentSizeTooltipVariant } from './types';

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
export const CONTENT_SIZE_TOOLTIP_PRIMARY_ACTION_CLASS_NAME =
  'sniptale-content-size-tooltip-primary-action';
export const CONTENT_SIZE_TOOLTIP_CANCEL_ACTION_CLASS_NAME =
  'sniptale-selection-size-cancel-button';
export const CONTENT_SIZE_TOOLTIP_RATIO_BUTTON_CLASS_NAME =
  'sniptale-content-size-tooltip-ratio-button';

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

  .sniptale-content-size-tooltip[data-variant='frame-edit']
    .${CONTENT_SIZE_TOOLTIP_PRIMARY_ACTION_CLASS_NAME} {
    border-color: transparent;
    background: transparent;
    color: var(--sniptale-color-text-primary);
    box-shadow: none;
  }

  .sniptale-content-size-tooltip[data-variant='frame-edit']
    .${CONTENT_SIZE_TOOLTIP_PRIMARY_ACTION_CLASS_NAME}:hover:not(:disabled) {
    border-color: transparent;
    background: transparent;
    color: var(--sniptale-color-text-primary-strong);
    box-shadow: none;
  }

  .sniptale-content-size-tooltip[data-variant='frame-edit']
    .${CONTENT_SIZE_TOOLTIP_CANCEL_ACTION_CLASS_NAME}:hover:not(:disabled),
  .sniptale-content-size-tooltip[data-variant='frame-edit']
    .${CONTENT_SIZE_TOOLTIP_CANCEL_ACTION_CLASS_NAME}:focus-visible {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }

  .sniptale-content-size-tooltip[data-variant='frame-edit']
    .${CONTENT_SIZE_TOOLTIP_CANCEL_ACTION_CLASS_NAME}:hover:not(:disabled) svg,
  .sniptale-content-size-tooltip[data-variant='frame-edit']
    .${CONTENT_SIZE_TOOLTIP_CANCEL_ACTION_CLASS_NAME}:focus-visible svg {
    color: var(--sniptale-color-text-primary-strong);
  }

  .sniptale-content-size-tooltip[data-variant='frame-edit']
    .${CONTENT_SIZE_TOOLTIP_RATIO_BUTTON_CLASS_NAME}[aria-pressed='true'] {
    border-color: transparent;
    background: var(--sniptale-color-surface-hover);
    color: var(--sniptale-color-text-primary);
    box-shadow: none;
  }

  .sniptale-content-size-tooltip[data-variant='frame-edit'] .sniptale-size-btn,
  .sniptale-content-size-tooltip[data-variant='frame-edit']
    .sniptale-size-btn:hover:not(:disabled) {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }
`;

const CONTENT_SIZE_TOOLTIP_SURFACE_STYLE: StyleRecord = {
  position: 'fixed',
  display: 'inline-flex',
  alignItems: 'center',
  flexWrap: 'nowrap',
  gap: '6px',
  whiteSpace: 'nowrap',
  fontFamily: 'var(--sniptale-font-interface)',
  fontSize: '13px',
  fontWeight: 400,
  lineHeight: '18px',
  minWidth: `${CONTENT_SIZE_TOOLTIP_DIMENSIONS.width}px`,
  maxWidth: 'calc(100vw - 24px)',
  padding: '6px',
  border: '1px solid color-mix(in srgb, var(--sniptale-color-border-soft) 88%, transparent)',
  borderRadius: '4px',
  background: 'rgb(from var(--sniptale-color-surface-panel) r g b / 1)',
  boxShadow: [
    '0 14px 28px color-mix(in srgb, var(--sniptale-color-shadow-strong) 14%, transparent)',
    'inset 0 1px 0 color-mix(in srgb, var(--sniptale-color-border-strong) 18%, transparent)',
  ].join(', '),
  pointerEvents: 'auto',
  zIndex: 2147483647,
  boxSizing: 'border-box',
};

export function getContentSizeTooltipSurfaceStyle(
  variant: ContentSizeTooltipVariant = 'default'
): StyleRecord {
  if (variant !== 'frame-edit') {
    return CONTENT_SIZE_TOOLTIP_SURFACE_STYLE;
  }

  return mergeStyleRecords(CONTENT_SIZE_TOOLTIP_SURFACE_STYLE, {
    width: `${CONTENT_SIZE_TOOLTIP_FRAME_EDIT_DIMENSIONS.width}px`,
    minWidth: `${CONTENT_SIZE_TOOLTIP_FRAME_EDIT_DIMENSIONS.width}px`,
    minHeight: `${CONTENT_SIZE_TOOLTIP_FRAME_EDIT_DIMENSIONS.height}px`,
    gap: '4px',
    padding: '5px',
    background: 'rgb(from var(--sniptale-color-surface-panel) r g b / 1)',
    border: '1px solid var(--sniptale-color-border-soft)',
    borderRadius: '4px',
    boxShadow: [
      '0 18px 40px -22px color-mix(in srgb, var(--sniptale-color-shadow-strong) 36%, transparent)',
      '0 8px 18px -12px color-mix(in srgb, var(--sniptale-color-shadow-strong) 22%, transparent)',
    ].join(', '),
  });
}

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
  borderRadius: '4px',
  border: '1px solid transparent',
  color: 'var(--sniptale-color-text-muted)',
  background: 'transparent',
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
  borderRadius: '4px',
  background: [
    'linear-gradient(180deg,',
    'color-mix(in srgb, var(--sniptale-color-surface-input) 96%, transparent),',
    'color-mix(in srgb, var(--sniptale-color-surface-input) 82%, transparent))',
  ].join(' '),
  color: 'var(--sniptale-color-text-primary)',
  fontFamily: 'var(--sniptale-font-interface)',
  fontSize: '13px',
  fontWeight: 400,
  lineHeight: '18px',
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
  borderRadius: '4px',
  fontFamily: 'var(--sniptale-font-interface)',
  fontSize: '13px',
  fontWeight: 400,
  lineHeight: '18px',
  border: '1px solid transparent',
  cursor: 'pointer',
  transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
};

export function getContentSizeTooltipActionButtonStyle(
  tone: 'neutral' | 'accent',
  variant: ContentSizeTooltipVariant = 'default'
): StyleRecord {
  const baseStyle =
    variant === 'frame-edit'
      ? mergeStyleRecords(CONTENT_SIZE_TOOLTIP_ACTION_BUTTON_STYLE, {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 32px',
          width: '32px',
          minWidth: '32px',
          padding: '0',
          boxSizing: 'border-box',
          lineHeight: 0,
        })
      : CONTENT_SIZE_TOOLTIP_ACTION_BUTTON_STYLE;

  if (tone === 'accent') {
    if (variant === 'frame-edit') {
      return {
        ...baseStyle,
        border: '0',
        background: 'transparent',
      };
    }

    return {
      ...baseStyle,
      border: '1px solid transparent',
      background: 'transparent',
      color: 'var(--sniptale-color-text-primary)',
    };
  }

  return {
    ...baseStyle,
    ...(variant === 'frame-edit'
      ? { border: '0', background: 'transparent' }
      : {
          background: 'transparent',
        }),
    color:
      variant === 'frame-edit'
        ? 'var(--sniptale-color-text-muted)'
        : 'var(--sniptale-color-text-primary)',
  };
}

export function getContentSizeTooltipRatioButtonStyle(params: {
  active: boolean;
  disabled?: boolean;
  variant?: ContentSizeTooltipVariant | undefined;
}): StyleRecord {
  if (params.disabled) {
    return mergeStyleRecords(CONTENT_SIZE_TOOLTIP_RATIO_BUTTON_STYLE, {
      opacity: 0.42,
      cursor: 'default',
    });
  }

  if (params.active) {
    if (params.variant !== 'frame-edit') {
      return mergeStyleRecords(CONTENT_SIZE_TOOLTIP_RATIO_BUTTON_STYLE, {
        borderColor: 'transparent',
        background: 'var(--sniptale-color-surface-hover)',
        color: 'var(--sniptale-color-text-primary)',
      });
    }

    return mergeStyleRecords(CONTENT_SIZE_TOOLTIP_RATIO_BUTTON_STYLE, {
      borderColor: 'transparent',
      background: 'var(--sniptale-color-surface-hover)',
      color: 'var(--sniptale-color-text-primary)',
    });
  }

  return CONTENT_SIZE_TOOLTIP_RATIO_BUTTON_STYLE;
}

export function getContentSizeTooltipStepButtonStyle(
  disabled: boolean,
  variant: ContentSizeTooltipVariant = 'default'
): StyleRecord {
  const baseStyle =
    variant === 'frame-edit'
      ? mergeStyleRecords(CONTENT_SIZE_TOOLTIP_STEPPER_BUTTON_STYLE, {
          border: '0',
          background: 'transparent',
        })
      : CONTENT_SIZE_TOOLTIP_STEPPER_BUTTON_STYLE;

  if (!disabled) return baseStyle;

  return mergeStyleRecords(baseStyle, {
    cursor: 'default',
  });
}
