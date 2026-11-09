import type React from 'react';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import { describe, expect, it, vi } from 'vitest';
import {
  createResizeCanvasAction,
  createResizeImageAction,
  getCanvasSizeSectionLabel,
  getImageSizeSectionLabel,
  renderEditorInspectorFrameSection,
  renderEditorInspectorSizeSection,
} from './size';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createSetDraftMock() {
  return vi.fn((value: React.SetStateAction<{ width: number; height: number }>) =>
    typeof value === 'function' ? value({ width: 1280, height: 720 }) : value
  );
}

function createSetLockedMock() {
  return vi.fn((value: React.SetStateAction<boolean>) =>
    typeof value === 'function' ? value(true) : value
  );
}

function createSetFrameDraftMock() {
  return vi.fn((value: React.SetStateAction<typeof DEFAULT_EDITOR_FRAME_SETTINGS>) =>
    typeof value === 'function' ? value(DEFAULT_EDITOR_FRAME_SETTINGS) : value
  );
}

function createSizeSectionHarness(
  previewFrameDraft?: React.Dispatch<React.SetStateAction<typeof DEFAULT_EDITOR_FRAME_SETTINGS>>,
  options: Partial<Parameters<typeof renderEditorInspectorFrameSection>[0]> = {}
) {
  const controller = {
    resizeCanvas: vi.fn(),
    resizeImage: vi.fn(),
  };
  const setDraft = createSetDraftMock();
  const setLocked = createSetLockedMock();
  const setFrameDraft = createSetFrameDraftMock();

  return {
    controller,
    frameSection: renderEditorInspectorFrameSection({
      applyGradientPreset: vi.fn(),
      backgroundPreviewStyle: {},
      clearBackgroundImage: vi.fn(),
      frameBackgroundImageFitOptions: [{ label: 'Cover', value: 'cover' }],
      frameBackgroundModeOptions: [{ label: 'Color', value: 'color' }],
      frameBackgroundPalette: ['#ffffff'],
      frameDraft: DEFAULT_EDITOR_FRAME_SETTINGS,
      lastFillModeRef: { current: 'color' },
      frameGradientPresets: [
        { angle: 90, from: '#111111', id: 'preset', label: 'Preset', to: '#ffffff' },
      ],
      frameLayoutModeOptions: [{ label: 'Expand', value: 'expand-canvas' }],
      framePaddingSummary: '12 / 12 / 12 / 12',
      onApplyFrame: vi.fn(),
      onPickBackgroundImage: vi.fn(),
      recentColors: ['#111111'],
      scenePresetHeader: null,
      setFrameDraft,
      previewFrameDraft,
      toNumber: (value: string) => Number(value),
      ...options,
    }),
    section: renderEditorInspectorSizeSection({
      aspectRatio: 16 / 9,
      draft: { height: 720, width: 1280 },
      label: 'Canvas size',
      locked: true,
      onApply: vi.fn(),
      setDraft,
      setLocked,
      updateLockedDraft: vi.fn((state) => state),
      valueText: '1280 x 720',
    }),
    setDraft,
    setFrameDraft,
    setLocked,
  };
}

function exerciseSizeSectionHarness(harness: ReturnType<typeof createSizeSectionHarness>) {
  createResizeImageAction(harness.controller, 640, 480)();
  createResizeCanvasAction(harness.controller, 800, 600)();
  harness.section.props.onWidthChange(640);
  harness.section.props.onHeightChange(480);
  harness.section.props.onToggleLock();
  harness.frameSection.props.setLayoutMode('expand-canvas');
  harness.frameSection.props.setBackgroundMode('color');
  harness.frameSection.props.previewFramePatch({ backgroundMode: 'gradient' });
  harness.frameSection.props.applyFramePatch({ backgroundMode: 'color' });
}

function registerSizeSectionHelperTests() {
  it('builds labels, actions, and row-level draft callbacks for size inspectors', () => {
    const harness = createSizeSectionHarness();

    exerciseSizeSectionHarness(harness);

    expect(getImageSizeSectionLabel()).toBe('editor.compact.imageSize');
    expect(getCanvasSizeSectionLabel()).toBe('editor.compact.canvasSize');
    expect(harness.controller.resizeImage).toHaveBeenCalledWith(640, 480);
    expect(harness.controller.resizeCanvas).toHaveBeenCalledWith(800, 600);
    expect(harness.setDraft).toHaveBeenCalledTimes(2);
    expect(harness.setLocked).toHaveBeenCalledTimes(1);
    expect(harness.setFrameDraft).toHaveBeenCalledTimes(3);
  });
}

describe('content size section helpers', registerSizeSectionHelperTests);

it('previews a frame patch through its dedicated dispatcher without accepting it', () => {
  const preview = createSetFrameDraftMock();
  const reset = vi.fn();
  const harness = createSizeSectionHarness(preview, {
    lineStyleOptions: [{ label: 'Solid', value: 'solid' }],
    shapeStrokePalette: ['#123456'],
    resetFrameDraft: reset,
  });
  harness.frameSection.props.previewFramePatch({ paddingTop: 96 });
  expect(preview).toHaveBeenCalledOnce();
  expect(preview.mock.results[0]?.value).toMatchObject({ paddingTop: 96 });
  expect(harness.setFrameDraft).not.toHaveBeenCalled();
  expect(harness.frameSection.props.lineStyleOptions).toEqual([{ label: 'Solid', value: 'solid' }]);
  expect(harness.frameSection.props.shapeStrokePalette).toEqual(['#123456']);
  harness.frameSection.props.onCancelFrame?.();
  expect(reset).toHaveBeenCalledOnce();
});
