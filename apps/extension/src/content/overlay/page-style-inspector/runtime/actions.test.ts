// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleRestoreRule,
} from '@sniptale/runtime-contracts/page-style';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import type {
  FrameSessionSnapshot,
  PagePreparationSessionSnapshot,
} from '../../../parser/page-preparation/history';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
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
      browserAnnotationSession.applySnapshot(snapshot.annotations);
    },
    captureSnapshot: () => ({
      annotations: browserAnnotationSession.captureSnapshot(),
      frameSession: cloneSnapshot(current).frameSession,
    }),
  };

  pagePreparationHistory.registerBridge(bridge);
  return () => pagePreparationHistory.unregisterBridge(bridge);
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.replaceChildren();
  vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue({
    0: DOMRect.fromRect({ height: 40, width: 80 }),
    [Symbol.iterator]: () => [DOMRect.fromRect({ height: 40, width: 80 })][Symbol.iterator](),
    item: (index) => (index === 0 ? DOMRect.fromRect({ height: 40, width: 80 }) : null),
    length: 1,
  });
  browserAnnotationSession.resetForDocument();
  pagePreparationHistory.clear();
});

afterEach(() => {
  if (vi.isFakeTimers()) {
    vi.runOnlyPendingTimers();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  browserAnnotationSession.resetForDocument();
  pagePreparationHistory.clear();
});

it('applies current-page rules through sniptale fallback with explicit retention', async () => {
  const unregisterBridge = registerHistoryBridge();
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
  unregisterBridge();
});

it('does not mutate DOM or evidence when the history transaction is unavailable', async () => {
  const target = document.createElement('p');
  target.id = 'target';
  document.body.append(target);

  await expect(
    applyPageStylePatchWithHistory({
      element: target,
      patch: { assets: [], declarations: [{ property: 'color', value: 'red' }] },
    })
  ).rejects.toThrow('Page style history transaction is unavailable');

  expect(target.style.cssText).toBe('');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  expect(pagePreparationHistory.getState().canUndo).toBe(false);
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
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.propertyChanges).toHaveLength(2);
  pagePreparationHistory.undo();
  expect(target.style.cssText).toBe('');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  pagePreparationHistory.redo();
  expect(target.style.color).toBe('rgb(255, 0, 0)');
  expect(target.style.fontSize).toBe('24px');
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.propertyChanges).toHaveLength(2);
  unregisterBridge();
});

it('rolls back DOM and publishes no evidence when style apply fails after transaction start', async () => {
  const unregisterBridge = registerHistoryBridge();
  const target = document.createElement('p');
  target.id = 'target';
  document.body.append(target);
  const originalSetProperty = target.style.setProperty.bind(target.style);
  vi.spyOn(target.style, 'setProperty').mockImplementation((property, value, priority) => {
    if (property === 'font-size') {
      throw new Error('page blocked write');
    }
    originalSetProperty(property, value, priority);
  });

  await expect(
    applyPageStylePatchWithHistory({
      element: target,
      patch: {
        assets: [],
        declarations: [
          { property: 'color', value: 'rgb(255, 0, 0)' },
          { property: 'font-size', value: '24px' },
        ],
      },
    })
  ).rejects.toThrow('Page style mutation failed');

  expect(target.style.cssText).toBe('');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  expect(pagePreparationHistory.getState().canUndo).toBe(false);
  unregisterBridge();
});

it('records a factual residual delta when silent rollback fails after transaction start', async () => {
  const unregisterBridge = registerHistoryBridge();
  const target = document.createElement('p');
  target.id = 'target';
  document.body.append(target);
  const originalSetProperty = target.style.setProperty.bind(target.style);
  const setProperty = vi
    .spyOn(target.style, 'setProperty')
    .mockImplementation((property, value, priority) => {
      if (property !== 'font-size') {
        originalSetProperty(property, value, priority);
      }
    });
  const removeProperty = vi.spyOn(target.style, 'removeProperty').mockReturnValue('');

  await expect(
    applyPageStylePatchWithHistory({
      element: target,
      patch: {
        assets: [],
        declarations: [
          { property: 'color', value: 'red' },
          { property: 'font-size', value: '24px' },
        ],
      },
    })
  ).rejects.toThrow('rollback-failed');

  expect(target.style.color).toBe('red');
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.propertyChanges).toEqual([
    expect.objectContaining({
      after: { priority: '', value: 'red' },
      before: { priority: '', value: '' },
      property: 'color',
    }),
  ]);
  vi.advanceTimersByTime(500);
  expect(pagePreparationHistory.getState().canUndo).toBe(true);
  setProperty.mockRestore();
  removeProperty.mockRestore();
  pagePreparationHistory.undo();
  expect(target.style.color).toBe('');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  unregisterBridge();
});

it('retains an invalid hostile residual only as one-way recovery without annotation evidence', async () => {
  const unregisterBridge = registerHistoryBridge();
  const target = document.createElement('p');
  target.id = 'target';
  document.body.append(target);
  const originalSetProperty = target.style.setProperty.bind(target.style);
  const setProperty = vi
    .spyOn(target.style, 'setProperty')
    .mockImplementation((property, _value, priority) => {
      if (property === 'background-image') {
        originalSetProperty(property, 'var(--hostile-page-value)', priority);
      }
    });
  const removeProperty = vi.spyOn(target.style, 'removeProperty').mockReturnValue('');

  await expect(
    applyPageStylePatchWithHistory({
      element: target,
      patch: {
        assets: [],
        declarations: [
          { property: 'background-image', value: 'linear-gradient(red, blue)' },
          { property: 'font-size', value: '24px' },
        ],
      },
    })
  ).rejects.toThrow('rollback-failed');

  expect(target.style.backgroundImage).toBe('var(--hostile-page-value)');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  vi.advanceTimersByTime(500);
  expect(pagePreparationHistory.getState()).toMatchObject({ canRedo: false, canUndo: true });
  setProperty.mockRestore();
  removeProperty.mockRestore();
  pagePreparationHistory.undo();
  expect(target.style.backgroundImage).toBe('');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  expect(pagePreparationHistory.getState()).toMatchObject({ canRedo: false, canUndo: false });
  unregisterBridge();
});

it('retains recovery before evidence publication when publication and compensation fail', async () => {
  const unregisterBridge = registerHistoryBridge();
  const target = document.createElement('p');
  target.id = 'target';
  document.body.append(target);
  let evidenceFailed = false;
  const recordPropertyChanges = vi
    .spyOn(browserAnnotationSession, 'recordPropertyChanges')
    .mockImplementation(() => {
      evidenceFailed = true;
      throw new Error('session publication failed');
    });
  const originalSetProperty = target.style.setProperty.bind(target.style);
  const setProperty = vi
    .spyOn(target.style, 'setProperty')
    .mockImplementation((property, value, priority) => {
      if (!evidenceFailed || property !== 'color') {
        originalSetProperty(property, value, priority);
      }
    });
  const originalRemoveProperty = target.style.removeProperty.bind(target.style);
  const removeProperty = vi
    .spyOn(target.style, 'removeProperty')
    .mockImplementation((property) =>
      evidenceFailed && property === 'color' ? originalRemoveProperty(property) : ''
    );

  await expect(
    applyPageStylePatchWithHistory({
      element: target,
      patch: {
        assets: [],
        declarations: [
          { property: 'color', value: 'red' },
          { property: 'font-size', value: '24px' },
        ],
      },
    })
  ).rejects.toThrow('Page style evidence failed and rollback failed');

  expect(target.style.color).toBe('');
  expect(target.style.fontSize).toBe('24px');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  vi.advanceTimersByTime(500);
  expect(pagePreparationHistory.getState()).toMatchObject({ canRedo: false, canUndo: true });
  recordPropertyChanges.mockRestore();
  setProperty.mockRestore();
  removeProperty.mockRestore();
  pagePreparationHistory.undo();
  expect(target.style.cssText).toBe('');
  expect(pagePreparationHistory.getState()).toMatchObject({ canRedo: false, canUndo: false });
  unregisterBridge();
});

it('removes style evidence when a property returns to its transaction baseline', async () => {
  const unregisterBridge = registerHistoryBridge();
  const target = document.createElement('p');
  target.id = 'target';
  document.body.append(target);

  await applyPageStylePatchWithHistory({
    element: target,
    patch: { assets: [], declarations: [{ property: 'color', value: 'red' }] },
  });
  vi.advanceTimersByTime(500);
  expect(browserAnnotationSession.captureSnapshot().domRecords).toHaveLength(1);

  await applyPageStylePatchWithHistory({
    element: target,
    patch: { assets: [], declarations: [{ property: 'color', value: null }] },
  });
  vi.advanceTimersByTime(500);

  expect(target.style.getPropertyValue('color')).toBe('');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  expect(pagePreparationHistory.getState().canUndo).toBe(true);
  pagePreparationHistory.undo();
  expect(target.style.getPropertyValue('color')).toBe('red');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toHaveLength(1);
  unregisterBridge();
});

it('records SVG style evidence and restores an original important priority atomically', async () => {
  const unregisterBridge = registerHistoryBridge();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const target = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  target.id = 'svg-target';
  target.style.setProperty('color', 'blue', 'important');
  svg.append(target);
  document.body.append(svg);

  await applyPageStylePatchWithHistory({
    element: target,
    patch: { assets: [], declarations: [{ property: 'color', value: 'red' }] },
  });
  vi.advanceTimersByTime(500);

  expect(
    browserAnnotationSession.captureSnapshot().domRecords[0]?.propertyChanges[0]
  ).toMatchObject({
    after: { priority: '', value: 'red' },
    before: { priority: 'important', value: 'blue' },
  });
  pagePreparationHistory.undo();
  expect(target.style.getPropertyValue('color')).toBe('blue');
  expect(target.style.getPropertyPriority('color')).toBe('important');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  unregisterBridge();
});

it('keeps DOM and evidence factual through failed undo recovery and retry', async () => {
  const unregisterBridge = registerHistoryBridge();
  const target = document.createElement('p');
  document.body.append(target);
  await applyPageStylePatchWithHistory({
    element: target,
    patch: {
      assets: [],
      declarations: [
        { property: 'color', value: 'red' },
        { property: 'font-size', value: '24px' },
      ],
    },
  });
  vi.advanceTimersByTime(500);

  const originalRemoveProperty = target.style.removeProperty.bind(target.style);
  const removeProperty = vi
    .spyOn(target.style, 'removeProperty')
    .mockImplementation((property) =>
      property === 'color' ? originalRemoveProperty(property) : ''
    );
  const originalSetProperty = target.style.setProperty.bind(target.style);
  const setProperty = vi
    .spyOn(target.style, 'setProperty')
    .mockImplementation((property, value, priority) => {
      if (property !== 'color') originalSetProperty(property, value, priority);
    });

  pagePreparationHistory.undo();
  expect(target.style.color).toBe('');
  expect(target.style.fontSize).toBe('24px');
  expect(
    browserAnnotationSession
      .captureSnapshot()
      .domRecords[0]?.propertyChanges.map((change) => change.property)
  ).toEqual(['font-size']);
  expect(pagePreparationHistory.getState()).toMatchObject({ canRedo: false, canUndo: true });

  setProperty.mockRestore();
  removeProperty.mockRestore();
  pagePreparationHistory.undo();
  expect(target.style.color).toBe('red');
  expect(target.style.fontSize).toBe('24px');
  expect(pagePreparationHistory.getState()).toMatchObject({ canRedo: false, canUndo: true });
  pagePreparationHistory.undo();
  expect(target.style.cssText).toBe('');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  expect(pagePreparationHistory.getState()).toMatchObject({ canRedo: true, canUndo: false });
  unregisterBridge();
});

it('keeps DOM and evidence factual through failed redo recovery and retry', async () => {
  const unregisterBridge = registerHistoryBridge();
  const target = document.createElement('p');
  document.body.append(target);
  await applyPageStylePatchWithHistory({
    element: target,
    patch: {
      assets: [],
      declarations: [
        { property: 'color', value: 'red' },
        { property: 'font-size', value: '24px' },
      ],
    },
  });
  vi.advanceTimersByTime(500);
  pagePreparationHistory.undo();

  const originalSetProperty = target.style.setProperty.bind(target.style);
  const setProperty = vi
    .spyOn(target.style, 'setProperty')
    .mockImplementation((property, value, priority) => {
      if (property !== 'font-size') originalSetProperty(property, value, priority);
    });
  const removeProperty = vi.spyOn(target.style, 'removeProperty').mockReturnValue('');

  pagePreparationHistory.redo();
  expect(target.style.color).toBe('red');
  expect(target.style.fontSize).toBe('');
  expect(
    browserAnnotationSession
      .captureSnapshot()
      .domRecords[0]?.propertyChanges.map((change) => change.property)
  ).toEqual(['color']);
  expect(pagePreparationHistory.getState()).toMatchObject({ canRedo: false, canUndo: true });

  setProperty.mockRestore();
  removeProperty.mockRestore();
  pagePreparationHistory.undo();
  expect(target.style.cssText).toBe('');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  expect(pagePreparationHistory.getState()).toMatchObject({ canRedo: true, canUndo: false });
  pagePreparationHistory.redo();
  expect(target.style.color).toBe('red');
  expect(target.style.fontSize).toBe('24px');
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.propertyChanges).toHaveLength(2);
  unregisterBridge();
});

it('publishes no evidence when a custom element reenters the owner style write', async () => {
  const unregisterBridge = registerHistoryBridge();
  const elementName = 'x-page-style-reentrant-producer';
  class ReentrantStyleElement extends HTMLElement {}
  customElements.define(elementName, ReentrantStyleElement);
  const target = document.createElement(elementName) as ReentrantStyleElement;
  document.body.append(target);
  const addReentrantRecords = () => {
    const intended = target.getAttribute('style');
    target.setAttribute('style', `${intended ?? ''}; --page-reentrant-write: 1`);
    if (intended === null) target.removeAttribute('style');
    else target.setAttribute('style', intended);
  };
  const originalSetProperty = target.style.setProperty.bind(target.style);
  vi.spyOn(target.style, 'setProperty').mockImplementation((property, value, priority) => {
    originalSetProperty(property, value, priority);
    addReentrantRecords();
  });
  const originalRemoveProperty = target.style.removeProperty.bind(target.style);
  vi.spyOn(target.style, 'removeProperty').mockImplementation((property) => {
    const previous = originalRemoveProperty(property);
    addReentrantRecords();
    return previous;
  });

  await expect(
    applyPageStylePatchWithHistory({
      element: target,
      patch: { assets: [], declarations: [{ property: 'color', value: 'red' }] },
    })
  ).rejects.toThrow('Page style mutation failed');

  expect(target.style.color).toBe('');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  expect(pagePreparationHistory.getState()).toMatchObject({ canRedo: false, canUndo: false });
  unregisterBridge();
});
