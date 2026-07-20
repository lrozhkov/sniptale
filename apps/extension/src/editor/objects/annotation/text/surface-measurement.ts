import type { Textbox } from 'fabric';

const TEXT_CALLOUT_CONTENT_HEIGHT_KEY = '__sniptaleTextCalloutContentHeight';

type TextboxWithMeasuredContentHeight = Pick<Textbox, 'height'> & {
  [TEXT_CALLOUT_CONTENT_HEIGHT_KEY]?: number;
};

export function getTextCalloutPadding(textbox: Pick<Textbox, 'padding'>): number {
  return typeof textbox.padding === 'number' ? textbox.padding : 0;
}

function normalizeMeasuredContentHeight(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function getMeasuredTextContentHeight(
  textbox: TextboxWithMeasuredContentHeight
): number | null {
  return normalizeMeasuredContentHeight(textbox[TEXT_CALLOUT_CONTENT_HEIGHT_KEY]);
}

export function setTextCalloutMeasuredContentHeight(
  textbox: TextboxWithMeasuredContentHeight,
  height: number
): void {
  Object.defineProperty(textbox, TEXT_CALLOUT_CONTENT_HEIGHT_KEY, {
    configurable: true,
    enumerable: false,
    value: height,
    writable: true,
  });
}
