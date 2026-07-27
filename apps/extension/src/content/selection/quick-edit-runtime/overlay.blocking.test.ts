// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/dom-host')>()),
  appendToContentOverlayRoot: (element: HTMLElement) => document.body.append(element),
}));

import {
  ensureQuickEditBlockingOverlay,
  updateQuickEditBlockingOverlayShape,
} from './overlay.blocking';
import { createQuickEditOverlayState } from './overlay.state';

afterEach(() => document.body.replaceChildren());

it('projects the active stroke inward without changing its previous outer visual box', () => {
  const target = document.createElement('div');
  Object.defineProperty(target, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ x: 12, y: 8, left: 12, top: 8, width: 64, height: 64 }),
  });
  const state = createQuickEditOverlayState();

  ensureQuickEditBlockingOverlay(state);
  updateQuickEditBlockingOverlayShape(state, target);

  expect(state.activeFrameOverlay?.style).toMatchObject({
    boxSizing: 'border-box',
    left: '6px',
    top: '2px',
    width: '76px',
    height: '76px',
  });
});
