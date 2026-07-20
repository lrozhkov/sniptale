// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resizeTextCalloutMock: vi.fn(),
}));

vi.mock('../../../objects/annotation/text/callout/resize', () => ({
  resizeTextCallout: mocks.resizeTextCalloutMock,
}));

import { DEFAULT_EDITOR_TEXTBOX_WIDTH } from '../../../objects/annotation/text';
import { resizeTechnicalDataTextObject } from './sizing';

beforeEach(() => {
  mocks.resizeTextCalloutMock.mockClear();
});

function createTextSettings() {
  return {
    fontFamily: 'inter',
    fontSize: 16,
    fontStyle: 'normal',
    fontWeight: '400',
  } as never;
}

it('uses the default textbox width for column technical data', () => {
  const text = { set: vi.fn() };

  resizeTechnicalDataTextObject(text as never, 'content', 'column', createTextSettings());

  expect(text.set).toHaveBeenCalledWith({ width: DEFAULT_EDITOR_TEXTBOX_WIDTH });
});

it('resizes row technical data through callout geometry', () => {
  const text = { set: vi.fn() };

  resizeTechnicalDataTextObject(text as never, 'wide row content', 'row', createTextSettings());

  expect(mocks.resizeTextCalloutMock).toHaveBeenCalledWith(text, expect.any(Number), 1);
  expect(mocks.resizeTextCalloutMock.mock.calls[0]?.[1]).toBeGreaterThanOrEqual(
    DEFAULT_EDITOR_TEXTBOX_WIDTH
  );
});

it('uses canvas measurement when a row text context is available', () => {
  const createElement = vi.spyOn(document, 'createElement').mockReturnValue({
    getContext: () => ({
      measureText: () => ({ width: 400 }),
    }),
  } as never);

  resizeTechnicalDataTextObject(
    { set: vi.fn() } as never,
    'measured row content',
    'row',
    createTextSettings()
  );

  expect(mocks.resizeTextCalloutMock).toHaveBeenCalledWith(expect.anything(), 402, 1);
  createElement.mockRestore();
});
