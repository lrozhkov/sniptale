// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { createRichShapeCalloutObject } from '..';
import { createRichShapeCalloutControls } from './factory';

it('adds authored tail controls only for callout rich shapes', () => {
  const object = createRichShapeCalloutObject({
    id: 'callout-controls',
    labelIndex: 1,
    left: 0,
    settings: DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).callout,
    top: 0,
    width: 160,
    height: 100,
  });

  expect(Object.keys(createRichShapeCalloutControls(object, vi.fn()))).toEqual(
    expect.arrayContaining(['calloutBaseStart', 'calloutBaseEnd', 'calloutTip'])
  );

  delete object.sniptaleRichShape.callout;
  expect(createRichShapeCalloutControls(object, vi.fn())['calloutTip']).toBeUndefined();
});
