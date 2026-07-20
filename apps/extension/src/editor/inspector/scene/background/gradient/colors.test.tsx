import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../../features/editor/document/constants';
import type { EditorFrameSettings } from '../../../../../features/editor/document/types';
import { EditorInspectorFrameBackgroundGradientColorControls } from './colors';

it('forwards gradient color props into the controls owner', () => {
  const applyFramePatch = vi.fn();
  const previewFramePatch = vi.fn();
  const element = EditorInspectorFrameBackgroundGradientColorControls({
    applyFramePatch,
    frameBackgroundPalette: ['#111111'],
    frameDraft: {
      ...DEFAULT_EDITOR_FRAME_SETTINGS,
      backgroundGradientFrom: '#111111',
      backgroundGradientTo: '#222222',
    } as EditorFrameSettings,
    previewFramePatch,
    recentColors: ['#333333'],
  }) as { props: Record<string, unknown> };

  expect(element.props['applyFramePatch']).toBe(applyFramePatch);
  expect(element.props['previewFramePatch']).toBe(previewFramePatch);
  expect(element.props['frameBackgroundPalette']).toEqual(['#111111']);
  expect(element.props['recentColors']).toEqual(['#333333']);
});
