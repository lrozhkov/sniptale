import { describe, expect, it } from 'vitest';
import {
  computeQuickEditSceneSize,
  computeQuickEditSceneLayout,
  computeQuickEditSceneCamera,
  computeQuickEditWindowTransform,
  quickEditCanvasPointToContent,
  quickEditContentPointToCanvas,
} from './scene';
import { createQuickEditAdvancedState } from './defaults';
import { loadQuickEditAdvancedState, loadQuickEditAdvancedContentState } from './validation';
import { reviewAdvancedContentBaseline } from '../document';
import { resolveQuickEditEffectiveState, resolveQuickEditExportPlan } from './effective';
import type { QuickEditBackgroundSettings } from './types';

const source = { width: 1920, height: 1080 };
const windowHeader = {
  kind: 'browser' as const,
  title: 'Example & <title>',
  url: 'https://sniptale.test/?a=1&b=2',
};
const identity = { scale: 1, centerX: 0.5, centerY: 0.5 };

describe('decorated original video', () => {
  it('adds rows without refitting source pixels, accumulates no height and restores identity', () => {
    const settings = { source, background: { enabled: false } as const, windowHeader };
    const size = computeQuickEditSceneSize(settings);
    expect(size).toEqual({ width: 1920, height: 1166, headerHeight: 86 });
    const layout = computeQuickEditSceneLayout({ ...settings, output: size, camera: identity });
    expect(layout.videoRect).toEqual({ x: 0, y: 86, ...source });
    expect(layout.windowRect).toEqual({ x: 0, y: 0, width: 1920, height: 1166 });
    expect(computeQuickEditSceneSize(settings)).toEqual(size);
    const off = computeQuickEditSceneSize({ ...settings, windowHeader: undefined });
    expect(off).toEqual({ ...source, headerHeight: 0 });
  });
  it.each(['fixed', 'follow-video'] as const)(
    'keeps source anchors and joins header/window edges for %s background',
    (zoomBehavior) => {
      const background: QuickEditBackgroundSettings = {
        enabled: true,
        type: 'solid',
        color: '#345678ff',
        zoomBehavior,
        layout: { padding: 64, cornerRadius: 40 },
      };
      const settings = { source, canvas: { width: 1080, height: 1920 }, background, windowHeader };
      const output = computeQuickEditSceneSize(settings);
      for (const scale of [1, 1.01, 2, 4])
        for (const center of [0, 0.4, 1]) {
          const camera = { scale, centerX: center, centerY: center };
          const layout = computeQuickEditSceneLayout({ ...settings, output, camera });
          const window = computeQuickEditWindowTransform(layout);
          const motion = computeQuickEditSceneCamera(layout, background);
          expect(window.x).toBe(layout.videoTransform.x);
          expect(window.y + window.height).toBeCloseTo(
            layout.videoTransform.y + layout.videoTransform.height
          );
          expect(motion.windowClip).toEqual(zoomBehavior === 'fixed' ? layout.windowRect : window);
          const point = { x: 0.37, y: 0.81 };
          const projected = quickEditContentPointToCanvas(point, layout.videoTransform);
          const restored = quickEditCanvasPointToContent(projected, layout.videoTransform)!;
          expect(restored.x).toBeCloseTo(point.x);
          expect(restored.y).toBeCloseTo(point.y);
        }
    }
  );
  it('rounds narrow-video header rows and preserves the source size', () => {
    const small = { width: 160, height: 90 };
    expect(
      computeQuickEditSceneSize({ source: small, windowHeader, background: { enabled: false } })
    ).toEqual({ width: 160, height: 108, headerHeight: 18 });
  });
  it('parses persisted content and rejects invalid header contracts without modifying legacy content', () => {
    const state = { ...createQuickEditAdvancedState(), windowHeader };
    expect(loadQuickEditAdvancedState(state)?.windowHeader).toEqual(windowHeader);
    expect(
      loadQuickEditAdvancedState({ ...state, windowHeader: { kind: 'browser', title: '' } })
        ?.windowHeader
    ).toEqual({ kind: 'browser', title: '' });
    const content = reviewAdvancedContentBaseline(state);
    expect(loadQuickEditAdvancedContentState(content)).toEqual(content);
    expect(
      loadQuickEditAdvancedState(createQuickEditAdvancedState())?.windowHeader
    ).toBeUndefined();
    for (const invalid of [
      null,
      { kind: 'os', title: '' },
      { kind: 'browser', title: 1 },
      { kind: 'browser', title: 'x'.repeat(513) },
      { ...windowHeader, url: 1 },
      { ...windowHeader, url: 'x'.repeat(2049) },
      { ...windowHeader, url: '\uD800' },
    ]) {
      expect(loadQuickEditAdvancedState({ ...state, windowHeader: invalid })).toBeNull();
      expect(loadQuickEditAdvancedContentState({ ...content, windowHeader: invalid })).toBeNull();
    }
  });
  it('suppresses header in basic mode and requires rendered export only while applied', () => {
    const state = { ...createQuickEditAdvancedState(), windowHeader };
    const document = { edits: [], canvasComments: [] };
    expect(resolveQuickEditEffectiveState(state).windowHeader).toBeUndefined();
    expect(resolveQuickEditExportPlan({ document, advanced: state })).toMatchObject({
      video: 'copy',
    });
    state.ui.mode = 'advanced';
    expect(resolveQuickEditEffectiveState(state).windowHeader).toEqual(windowHeader);
    expect(resolveQuickEditExportPlan({ document, advanced: state })).toMatchObject({
      video: 'render',
      reasons: ['window-header'],
    });
    expect(
      resolveQuickEditExportPlan({ document, advanced: state, videoRenderAvailable: false })
    ).toMatchObject({ kind: 'unavailable' });
  });
});
