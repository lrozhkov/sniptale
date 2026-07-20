import { expect, it } from 'vitest';
import {
  createScenarioCaptureStep,
  createScenarioDividerStep,
  createScenarioNoteStep,
  createScenarioSectionStep,
} from '../../features/scenario/project/public';
import { buildScenarioWorkspaceWindow, resolveScenarioWorkspaceVisibleItems } from './helpers';

it('builds ordered insert and step items with estimated heights', () => {
  const window = buildScenarioWorkspaceWindow([
    createScenarioSectionStep({ title: 'Intro' }),
    createScenarioCaptureStep({
      assetId: 'asset-1',
      captureSurface: 'visible',
      sourceKind: 'manual',
      page: {
        title: 'Page',
        url: 'https://example.com',
        viewport: { x: 0, y: 0, width: 1280, height: 720 },
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 1,
      },
    }),
    createScenarioDividerStep(),
  ]);

  expect(window.items.map((item) => item.key)).toEqual([
    'insert-0',
    expect.stringMatching(/^step-/),
    'insert-1',
    expect.stringMatching(/^step-/),
    'insert-2',
    expect.stringMatching(/^step-/),
    'insert-3',
  ]);
  expect(window.totalHeight).toBeGreaterThan(0);
  expect(window.items[0]?.start).toBe(0);
  expect(window.items.at(-1)?.index).toBe(3);
  expect(window.items.at(-1)?.size).toBe(52);
});

it('prefers measured heights over estimates and slices visible items with overscan', () => {
  const note = createScenarioNoteStep({ title: 'Tip' });
  const capture = createScenarioCaptureStep({
    assetId: 'asset-2',
    captureSurface: 'visible',
    sourceKind: 'manual',
    page: {
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
  });
  const window = buildScenarioWorkspaceWindow([note, capture], {
    'insert-0': 30,
    [`step-${note.id}`]: 140,
    'insert-1': 40,
    [`step-${capture.id}`]: 300,
    'insert-2': 50,
  });

  expect(window.totalHeight).toBe(560);

  const visibleItems = resolveScenarioWorkspaceVisibleItems({
    window,
    scrollTop: 191,
    viewportHeight: 120,
    overscanPx: 20,
  });

  expect(visibleItems.map((item) => item.key)).toEqual(['insert-1', `step-${capture.id}`]);
});

it('returns a fallback slice when scroll position temporarily overshoots the measured window', () => {
  const note = createScenarioNoteStep({ title: 'Tip' });
  const divider = createScenarioDividerStep();
  const window = buildScenarioWorkspaceWindow([note, divider], {
    'insert-0': 30,
    [`step-${note.id}`]: 140,
    'insert-1': 40,
    [`step-${divider.id}`]: 80,
    'insert-2': 50,
  });

  const visibleItems = resolveScenarioWorkspaceVisibleItems({
    window,
    scrollTop: 5000,
    viewportHeight: 240,
    overscanPx: 0,
  });

  expect(visibleItems.map((item) => item.key)).toEqual([
    'insert-0',
    `step-${note.id}`,
    'insert-1',
    `step-${divider.id}`,
    'insert-2',
  ]);
});
