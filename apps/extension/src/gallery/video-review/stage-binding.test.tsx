// @vitest-environment jsdom
import {
  createQuickEditBorder,
  createQuickEditSpotlight,
} from '../../features/video/project/scene/focus-appearance';
import { planReviewPresentationSequence } from '../../features/video/review/presentation-sequence';
import { createNewWorkspacePresentationSettings } from '../../features/video/review/advanced/presentation';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewStageBinding } from './stage-binding';
import type { ReviewStage } from './stage';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';

import { projectReviewFocus } from '../../features/video/review/focus-edits';
import { buildReviewTimeMap } from '../../features/video/review/timeline';

let outerFadePlan: Parameters<typeof ReviewStage>[0]['outerFadePlan'];
let watermark: Parameters<typeof ReviewStage>[0]['watermark'];
let scene: Parameters<typeof ReviewStage>[0]['scene'];
vi.mock('./stage', () => ({
  ReviewStage: (props: Parameters<typeof ReviewStage>[0]) => {
    outerFadePlan = props.outerFadePlan;
    scene = props.scene;
    watermark = props.watermark;
    return null;
  },
}));

it.each(['spotlight', 'border', 'zoom'] as const)(
  'preserves camera and selected %s composition across framing and link gaps',
  (kind) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const plan = planReviewPresentationSequence({
      settings: createNewWorkspacePresentationSettings(),
      mainDuration: 10,
      fragmentOffset: 0,
      includeBookends: true,
      rate: { numerator: 60, denominator: 1 },
    });
    if (!plan.ok) throw new Error('Expected plan');
    const overlay = {
      settings: undefined,
      editable: false,
      onPreview: vi.fn(),
      onChange: vi.fn(),
      onError: vi.fn(),
    };
    const host = document.createElement('div');
    const root = createRoot(host);
    const camera = {
      ...createQuickEditZoomRegion({ id: 'camera', at: 0, duration: 10 }),
      transform: { scale: 2, centerX: 0.4, centerY: 0.4 },
      enter: { type: 'none' as const, duration: 0 },
    };
    const selected = {
      ...createQuickEditZoomRegion({ id: 'focus', at: 0, duration: 4 }),
      sourceAnchor: { start: 0, end: 8 },
      transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
      linkTo: 'target',
      linkEasing: 'linear' as const,
      ...(kind === 'border'
        ? { border: createQuickEditBorder() }
        : kind === 'spotlight'
          ? { spotlight: createQuickEditSpotlight() }
          : {}),
    };
    const map = buildReviewTimeMap(10, [
      { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
      {
        id: 'speed',
        kind: 'speed',
        start: 4,
        end: 8,
        requestedStart: 4,
        requestedEnd: 8,
        rate: 2,
        audio: 'speed',
      },
    ]);
    const target = {
      ...selected,
      id: 'target',
      start: 5,
      end: 6,
      sourceAnchor: { start: 9, end: 10 },
      transform: { scale: 4, centerX: 0.5, centerY: 0.5 },
    };
    const projected = projectReviewFocus([selected, target], map);
    const cameraRegions = kind === 'zoom' ? [] : [camera];
    try {
      act(() =>
        root.render(
          <ReviewStageBinding
            outerFadePlan={plan.plan}
            watermark={overlay}
            url="blob:video"
            source={{ width: 320, height: 180, duration: 10, size: 1, mimeType: 'video/webm' }}
            video={{ current: null }}
            drawing={false}
            region={undefined}
            zoomRegions={[...cameraRegions, ...projected]}
            focusTimeMap={map}
            background={{ enabled: false }}
            outputTime={kind === 'zoom' ? 4.5 : 2}
            zoomOverlay={{
              region: selected,
              onPreview: vi.fn(),
              onChange: vi.fn(),
              onInteract: vi.fn(),
            }}
            comments={[]}
            annotations={[]}
            canvasComments={{
              selectedId: null,
              onSelect: vi.fn(),
              onPatch: vi.fn(async () => {}),
              setGeometry: vi.fn(),
            }}
            overlaysVisible
            time={3}
            busy={false}
            onRegion={vi.fn()}
            onReady={vi.fn()}
            onTime={vi.fn()}
            onPlaying={vi.fn()}
            onError={vi.fn()}
          />
        )
      );
      expect(outerFadePlan).toBe(plan.plan);
      expect(watermark).toBe(overlay);
      expect(scene?.camera.scale).toBe(kind === 'zoom' ? 3 : 2);
      expect(scene?.focus?.regions.map((region) => region.id)).toEqual([
        ...cameraRegions.map((region) => region.id),
        ...projected.map((region) => region.id),
      ]);
      const selectedTail = scene?.focus?.regions.find((region) => region.id === 'focus:slice:1');
      expect(selectedTail?.enter.type).toBe('none');
      if (kind !== 'border') expect(selectedTail?.linkTo).toBe('target');
      if (kind === 'border') {
        expect(selectedTail?.borderClock?.enter.type).toBe('none');
        expect(selectedTail?.borderClock?.rate).toBe(2);
      }
    } finally {
      act(() => root.unmount());
      vi.unstubAllGlobals();
    }
  }
);
