// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenarioRecorderStepPreview } from './step-card.preview';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderPreview(previewDataUrl: string) {
  act(() => {
    root?.render(<ScenarioRecorderStepPreview previewDataUrl={previewDataUrl} />);
  });
}

function expectPreviewImage() {
  const image = container?.querySelector<HTMLImageElement>('img');
  expect(image).not.toBeNull();
  if (!image) {
    throw new Error('Expected preview image');
  }

  return image;
}

function setupPreviewTest() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
}

function cleanupPreviewTest() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
}

function expectFallbackAfterPreviewError() {
  act(() => {
    expectPreviewImage().dispatchEvent(new Event('error'));
  });

  expect(container?.textContent).toContain('scenario.content.step');
  expect(container?.querySelector('img')).toBeNull();
}

function expectFallbackResetsOnNextPreviewUrl() {
  renderPreview('data:image/png;base64,1');
  expectFallbackAfterPreviewError();

  renderPreview('data:image/png;base64,2');

  expect(expectPreviewImage().getAttribute('src')).toBe('data:image/png;base64,2');
}

function expectSamePreviewUrlRetriesAfterPageRestore() {
  renderPreview('data:image/png;base64,1');

  expect(expectPreviewImage().getAttribute('loading')).toBe('eager');
  expectFallbackAfterPreviewError();

  act(() => {
    window.dispatchEvent(new Event('pageshow'));
  });

  expect(expectPreviewImage().getAttribute('src')).toBe('data:image/png;base64,1');
}

describe('ScenarioRecorderStepPreview', () => {
  beforeEach(setupPreviewTest);
  afterEach(cleanupPreviewTest);

  it(
    'shows a translated fallback when the preview image errors and resets on the next preview url',
    expectFallbackResetsOnNextPreviewUrl
  );

  it(
    'retries the same preview url when the page is restored',
    expectSamePreviewUrlRetriesAfterPageRestore
  );
});
