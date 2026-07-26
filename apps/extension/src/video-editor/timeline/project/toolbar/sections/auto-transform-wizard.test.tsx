// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { AutoTransformWizard } from './auto-transform-wizard';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('keeps wizard actions in the canonical modal without a decorative header strip', () => {
  const onApply = vi.fn();
  const onClose = vi.fn();

  act(() => {
    root?.render(
      <AutoTransformWizard
        draft={DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS}
        onApply={onApply}
        onClose={onClose}
        onDraftChange={vi.fn()}
      />
    );
  });

  expect(container?.querySelector('.sniptale-modal')).not.toBeNull();
  expect(container?.querySelector('.sniptale-modal-accent')).toBeNull();
  expect(container?.querySelector('.sniptale-modal-accent-sm')).toBeNull();

  act(() => {
    getButton('videoEditor.timeline.autoTransformApply').click();
    getButton('common.actions.cancel').click();
  });

  expect(onApply).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});

function getButton(label: string): HTMLButtonElement {
  const button = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (candidate) => candidate.textContent?.includes(label)
  );
  if (!button) {
    throw new Error(`Expected button: ${label}`);
  }
  return button;
}
