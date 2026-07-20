import { describe, expect, it, vi } from 'vitest';
import { buildMetadataSections } from './sections';
import type { ScenarioCaptureMetadataView } from './types';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

const populatedView: ScenarioCaptureMetadataView = {
  captureMetadata: {
    pointerRange: {
      start: { x: 420, y: 220 },
      end: { x: 460, y: 250 },
      minX: 420,
      minY: 220,
      maxX: 460,
      maxY: 250,
      distance: 50,
      durationMs: 180,
    },
    scroll: {
      startX: 0,
      startY: 100,
      endX: 0,
      endY: 260,
      deltaX: 0,
      deltaY: 160,
    },
    trigger: 'pointer-up',
  },
  captureSurface: 'selection',
  cursorPoint: { x: 460, y: 250 },
  interactionPoint: { x: 452, y: 244 },
  page: {
    title: 'Release dashboard',
    url: 'https://example.test/releases',
    viewport: { x: 0, y: 0, width: 1440, height: 900 },
    scrollX: 0,
    scrollY: 260,
    devicePixelRatio: 2,
  },
  sourceKind: 'auto-click',
  target: {
    selector: '[data-testid="publish"]',
    iframeSelector: null,
    tagName: 'button',
    role: 'button',
    text: 'Publish',
    ariaLabel: 'Publish',
    title: null,
    rect: { x: 388, y: 194, width: 140, height: 52 },
    framePadding: { top: 4, left: 4, right: 4, bottom: 4 },
  },
};

const fallbackView: ScenarioCaptureMetadataView = {
  captureMetadata: {
    pointerRange: null,
    scroll: null,
    trigger: 'keyboard-enter',
  },
  captureSurface: 'full',
  cursorPoint: null,
  interactionPoint: null,
  page: {
    title: null,
    url: null,
    viewport: { x: 0, y: 0, width: 1280, height: 720 },
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
  },
  sourceKind: 'manual',
  target: null,
};

function verifyPopulatedSections() {
  const sections = buildMetadataSections(populatedView);

  expect(sections).toHaveLength(5);
  expect(sections[0]).toEqual(
    expect.objectContaining({
      title: 'scenario.common.metadata.groups.target',
    })
  );
  expect(sections[0]?.items).toContainEqual(
    expect.objectContaining({
      label: 'scenario.common.metadata.fields.title',
      value: 'scenario.common.metadata.empty',
    })
  );
  expect(sections[2]?.items).toContainEqual(
    expect.objectContaining({
      label: 'scenario.common.metadata.fields.captureSurface',
      value: 'scenario.common.metadata.values.surfaceSelection',
    })
  );
  expect(sections[2]?.items).toContainEqual(
    expect.objectContaining({
      label: 'scenario.common.metadata.fields.sourceKind',
      value: 'scenario.common.metadata.values.sourceAutoClick',
    })
  );
  expect(sections[3]?.items).toContainEqual(
    expect.objectContaining({
      label: 'scenario.common.metadata.fields.bounds',
      value: '420, 220 • 460 × 250',
    })
  );
  expect(sections[4]?.items).toContainEqual(
    expect.objectContaining({
      label: 'scenario.common.metadata.fields.delta',
      value: '0 × 160',
    })
  );
}

function verifyFallbackSections() {
  const sections = buildMetadataSections(fallbackView);

  expect(sections[0]?.items).toContainEqual(
    expect.objectContaining({
      label: 'scenario.common.metadata.fields.selector',
      value: 'scenario.common.metadata.empty',
    })
  );
  expect(sections[2]?.items).toContainEqual(
    expect.objectContaining({
      label: 'scenario.common.metadata.fields.captureSurface',
      value: 'scenario.common.metadata.values.surfaceFull',
    })
  );
  expect(sections[2]?.items).toContainEqual(
    expect.objectContaining({
      label: 'scenario.common.metadata.fields.sourceKind',
      value: 'scenario.common.metadata.values.sourceManual',
    })
  );
  expect(sections[2]?.items).toContainEqual(
    expect.objectContaining({
      label: 'scenario.common.metadata.fields.trigger',
      value: 'scenario.common.metadata.values.triggerKeyboardEnter',
    })
  );
  expect(sections[3]?.items).toContainEqual(
    expect.objectContaining({
      label: 'scenario.common.metadata.fields.distance',
      value: 'scenario.common.metadata.empty',
    })
  );
  expect(sections[4]?.items).toContainEqual(
    expect.objectContaining({
      label: 'scenario.common.metadata.fields.end',
      value: 'scenario.common.metadata.empty',
    })
  );
}

describe('buildMetadataSections', () => {
  it(
    'builds the canonical section set with populated and empty fallback values',
    verifyPopulatedSections
  );
  it('covers full-surface manual fallback branches for empty values', verifyFallbackSections);
});
