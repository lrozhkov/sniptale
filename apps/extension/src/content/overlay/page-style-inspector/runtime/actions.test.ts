// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleRestoreRule,
} from '@sniptale/runtime-contracts/page-style';
import {
  HistoryLocatorAllocationError,
  pagePreparationHistory,
} from '../../../parser/page-preparation/history';
import type {
  FrameSessionSnapshot,
  PagePreparationSessionSnapshot,
} from '../../../parser/page-preparation/history';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { applyPageStylePatchWithHistory, applyPageStyleRestoreRuleWithHistory } from './actions';

vi.mock('../../../../composition/persistence/page-style/assets', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/page-style/assets')
  >()),
  savePageStyleAsset: vi.fn(),
}));

function createRule(overrides: Partial<PageStyleRestoreRule> = {}): PageStyleRestoreRule {
  return {
    createdAt: 1,
    enabled: true,
    id: 'rule-1',
    name: 'Rule',
    patch: {
      assets: [],
      declarations: [{ property: 'color', value: 'rgb(255, 0, 0)' }],
    },
    propertySummary: ['color'],
    scope: {
      active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
      exactAddress: 'https://example.test/page',
    },
    selector: { locator: '#target' },
    updatedAt: 1,
    ...overrides,
  };
}

function createFrameSnapshot(label: string): FrameSessionSnapshot {
  return {
    frames: [
      {
        height: 40,
        id: `frame-${label}`,
        linkedElementSelector: `#${label}`,
        width: 80,
        x: 1,
        y: 2,
      } as FrameSessionSnapshot['frames'][number],
    ],
    globalEffectMode: 'border',
    globalStepBadgeSettings: { autoMode: true },
    sessionBorderPreset: DEFAULT_BORDER_PRESET,
    sessionBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
    sessionCalloutStyle: null,
    sessionFocusSettings: { opacity: 0.5, showBorder: false },
    sessionStepBadgeTemplate: null,
    stepBadgeOrder: [[`frame-${label}`, 0]],
  };
}

function createSnapshot(label: string): PagePreparationSessionSnapshot {
  return {
    annotations: {
      domRecords: [],
      frameOrders: [],
      nextAnnotationId: 1,
      nextCommentMarker: 1,
      nextCreationOrder: 1,
      schemaVersion: 1,
    },
    frameSession: createFrameSnapshot(label),
  };
}

function cloneSnapshot(snapshot: PagePreparationSessionSnapshot): PagePreparationSessionSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as PagePreparationSessionSnapshot;
}

function registerHistoryBridge() {
  let current = createSnapshot('a');
  const bridge = {
    applySnapshot: (snapshot: PagePreparationSessionSnapshot) => {
      current = cloneSnapshot(snapshot);
    },
    captureSnapshot: () => cloneSnapshot(current),
  };

  pagePreparationHistory.registerBridge(bridge);
  return () => pagePreparationHistory.unregisterBridge(bridge);
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.replaceChildren();
  pagePreparationHistory.clear();
});

afterEach(() => {
  if (vi.isFakeTimers()) {
    vi.runOnlyPendingTimers();
  }
  vi.useRealTimers();
  pagePreparationHistory.clear();
});

it('applies current-page rules through sniptale fallback with explicit retention', async () => {
  const target = document.createElement('p');
  target.dataset['sniptaleId'] = 'stable-rule-target';
  target.textContent = 'Current text';
  document.body.append(target);

  await expect(
    applyPageStyleRestoreRuleWithHistory(
      createRule({
        contentRetention: { text: { enabled: true, text: 'Approved retained text' } },
        selector: { locator: '[', sniptaleId: 'stable-rule-target' },
      })
    )
  ).resolves.toBe(true);

  expect(target.style.color).toBe('rgb(255, 0, 0)');
  expect(target.textContent).toBe('Approved retained text');
});

it('reports unresolved current-page rules without mutating the page', async () => {
  const target = document.createElement('p');
  target.id = 'other';
  target.textContent = 'Current text';
  document.body.append(target);

  await expect(
    applyPageStyleRestoreRuleWithHistory(
      createRule({ selector: { locator: '#missing', sniptaleId: 'missing-stable-id' } })
    )
  ).resolves.toBe(false);

  expect(target.style.color).toBe('');
  expect(target.textContent).toBe('Current text');
});

it('groups rapid inspector previews into one history entry', async () => {
  const unregisterBridge = registerHistoryBridge();
  const target = document.createElement('p');
  target.id = 'target';
  target.textContent = 'Current text';
  document.body.append(target);

  await applyPageStylePatchWithHistory({
    element: target,
    patch: { assets: [], declarations: [{ property: 'color', value: 'rgb(255, 0, 0)' }] },
    selector: { locator: '#target' },
  });
  await applyPageStylePatchWithHistory({
    element: target,
    patch: { assets: [], declarations: [{ property: 'font-size', value: '24px' }] },
    selector: { locator: '#target' },
  });

  expect(pagePreparationHistory.getState().canUndo).toBe(false);

  vi.advanceTimersByTime(500);

  expect(pagePreparationHistory.getState().canUndo).toBe(true);
  pagePreparationHistory.undo();
  expect(target.getAttribute('style')).toBeNull();
  pagePreparationHistory.redo();
  expect(target.style.color).toBe('rgb(255, 0, 0)');
  expect(target.style.fontSize).toBe('24px');
  unregisterBridge();
});

it('cancels and clears a pending inspector transaction when locator validation fails', async () => {
  const unregisterBridge = registerHistoryBridge();
  const target = document.createElement('p');
  target.id = 'target';
  target.setAttribute('data-sniptale-id', 'page-owned-id');
  document.body.append(target);

  await applyPageStylePatchWithHistory({
    element: target,
    patch: { assets: [], declarations: [{ property: 'color', value: 'rgb(255, 0, 0)' }] },
  });
  target.setAttribute('data-sniptale-id', 'page-replacement');

  expect(() => vi.advanceTimersByTime(500)).toThrow(HistoryLocatorAllocationError);
  expect(pagePreparationHistory.getState().canUndo).toBe(false);

  await applyPageStylePatchWithHistory({
    element: target,
    patch: { assets: [], declarations: [{ property: 'font-size', value: '24px' }] },
  });
  expect(() => vi.advanceTimersByTime(500)).not.toThrow();
  expect(pagePreparationHistory.getState().canUndo).toBe(true);
  unregisterBridge();
});
