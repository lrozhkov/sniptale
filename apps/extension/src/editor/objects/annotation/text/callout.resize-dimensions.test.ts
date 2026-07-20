import { expect, it } from 'vitest';
import { getScaledTextCalloutResizeDimensions } from './callout';

it('resolves live or stored text callout surface width during resize normalization', () => {
  const textbox = {
    fontSize: 16,
    height: 40,
    sniptaleTextCalloutFormat: 'plain',
    sniptaleTextCalloutHeight: 72,
    sniptaleTextCalloutWidth: 144,
    sniptaleTextLayoutMode: 'fixed-width',
    padding: 0,
    scaleX: 2,
    scaleY: 3,
    width: 60,
  };

  expect(getScaledTextCalloutResizeDimensions(textbox as never)).toEqual({
    height: 216,
    width: 120,
  });
  expect(
    getScaledTextCalloutResizeDimensions(textbox as never, { preserveStoredWidth: true })
  ).toEqual({ height: 216, width: 288 });
});
