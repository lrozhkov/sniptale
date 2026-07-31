// @vitest-environment jsdom

import { expect, it } from 'vitest';
import {
  createBorderSettingsFixture,
  createCalloutSettingsFixture,
  createFrameDataFixture,
  createStepBadgeSettingsFixture,
} from './test-support';
import { createBrowserFrameAnnotationInputs, createBrowserFrameAnnotationSync } from './annotation';

const context = {
  pageUrl: 'https://example.test/page',
  viewport: { height: 720, width: 1280 },
};

it('projects linked and free frames into minimal export evidence', () => {
  const linked = createFrameDataFixture('linked', {
    borderSettings: createBorderSettingsFixture({ name: 'Review' }),
    callout: createCalloutSettingsFixture({
      htmlContent: '<p>First <strong>line</strong></p><div>Second<br>line</div>',
    }),
    linkedElementSelector: '#target',
  });
  const free = createFrameDataFixture('free', {
    borderSettings: createBorderSettingsFixture({ name: '   ' }),
    callout: createCalloutSettingsFixture({ enabled: false, htmlContent: '<p>Hidden</p>' }),
    x: 80,
    y: 90,
  });

  expect(createBrowserFrameAnnotationInputs([linked, free], context)).toEqual([
    {
      borderPresetName: 'Review',
      comment: 'First line\nSecond\nline',
      frameId: 'linked',
      kind: 'linked',
      linkedElementSelector: '#target',
      pageUrl: context.pageUrl,
      rect: { height: 80, width: 120, x: 10, y: 20 },
      viewport: context.viewport,
    },
    {
      frameId: 'free',
      kind: 'free',
      pageUrl: context.pageUrl,
      rect: { height: 80, width: 120, x: 80, y: 90 },
      viewport: context.viewport,
    },
  ]);
});

it('omits empty comments and automatically generated blur frames', () => {
  const emptyComment = createFrameDataFixture('empty', {
    callout: createCalloutSettingsFixture({ htmlContent: '<p><br></p>' }),
  });
  const automatic = createFrameDataFixture('auto', { createdBy: 'auto-blur' });

  expect(createBrowserFrameAnnotationInputs([emptyComment, automatic], context)).toEqual([
    expect.objectContaining({ frameId: 'empty' }),
  ]);
  expect(createBrowserFrameAnnotationInputs([emptyComment], context)[0]).not.toHaveProperty(
    'comment'
  );
});

it('does not treat step-badge projection changes as frame annotation evidence', () => {
  const before = createFrameDataFixture('frame', {
    stepBadge: createStepBadgeSettingsFixture({ value: '1' }),
  });
  const after = createFrameDataFixture('frame', {
    stepBadge: createStepBadgeSettingsFixture({ anchor: 'bottom-right', value: '9' }),
  });

  expect(createBrowserFrameAnnotationInputs([after], context)).toEqual(
    createBrowserFrameAnnotationInputs([before], context)
  );
});

it('selects only export-relevant changes made by the current command', () => {
  const liveDrift = createFrameDataFixture('frame', { x: 50 });
  const automatic = createFrameDataFixture('auto', { createdBy: 'auto-blur' });

  expect(createBrowserFrameAnnotationSync([liveDrift], [liveDrift, automatic], context)).toEqual({
    inputs: [
      expect.objectContaining({ frameId: 'frame', rect: expect.objectContaining({ x: 50 }) }),
    ],
    updatedFrameIds: [],
  });

  const commented = createFrameDataFixture('frame', {
    callout: createCalloutSettingsFixture({ htmlContent: '<p>New evidence</p>' }),
    x: 50,
  });
  expect(createBrowserFrameAnnotationSync([liveDrift], [commented], context)).toEqual({
    inputs: [expect.objectContaining({ comment: 'New evidence', frameId: 'frame' })],
    updatedFrameIds: ['frame'],
  });
});
