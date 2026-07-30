// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { browserAnnotationSession } from '../session';
import type { BrowserFrameAnnotationInput } from '../types';
import * as formatter from './formatter';
import { prepareBrowserAnnotationsExportText } from './application';

function createFrameInput(comment: string): BrowserFrameAnnotationInput {
  return {
    comment,
    frameId: 'frame-1',
    kind: 'free',
    pageUrl: 'https://example.test/page',
    rect: { height: 80, width: 120, x: 10, y: 20 },
    viewport: { height: 720, width: 1280 },
  };
}

beforeEach(() => browserAnnotationSession.resetForDocument());
afterEach(() => {
  vi.restoreAllMocks();
  browserAnnotationSession.resetForDocument();
});

it('formats exactly one snapshot captured before asynchronous preparation yields', async () => {
  browserAnnotationSession.syncFrames([createFrameInput('Initial')]);
  const captureSpy = vi.spyOn(browserAnnotationSession, 'captureSnapshot');
  const formatSpy = vi.spyOn(formatter, 'formatBrowserAnnotationSnapshot');

  const pendingText = prepareBrowserAnnotationsExportText();
  browserAnnotationSession.syncFrames([createFrameInput('Changed later')]);
  const text = await pendingText;

  expect(captureSpy).toHaveBeenCalledTimes(1);
  expect(formatSpy).toHaveBeenCalledTimes(1);
  expect(text).toContain('Comment:\nInitial');
  expect(text).not.toContain('Changed later');
});
