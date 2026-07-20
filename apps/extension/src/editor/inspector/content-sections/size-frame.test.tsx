import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import {
  createResizeCanvasAction,
  createResizeImageAction,
  getCanvasSizeSectionLabel,
  getImageSizeSectionLabel,
  renderEditorInspectorFrameSection,
  renderEditorInspectorSizeSection,
} from './size';

const framePanelProps = vi.hoisted(() => vi.fn());
const sizePanelProps = vi.hoisted(() => vi.fn());

vi.mock('../scene', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scene')>()),
  EditorInspectorFramePanel: (props: Record<string, unknown>) => {
    framePanelProps(props);
    return <div>frame-panel</div>;
  },
}));

vi.mock('../size-panel', () => ({
  EditorInspectorSizePanel: (props: Record<string, unknown>) => {
    sizePanelProps(props);
    return <div>size-panel</div>;
  },
}));

function createFrameSectionProps(overrides: Record<string, unknown> = {}) {
  return {
    scenePresetHeader: null,
    frameDraft: DEFAULT_EDITOR_FRAME_SETTINGS,
    framePaddingSummary: '128 / 128 / 128 / 128',
    backgroundPreviewStyle: {},
    frameLayoutModeOptions: [{ value: 'expand-canvas' as const, label: 'Expand' }],
    frameBackgroundModeOptions: [{ value: 'gradient' as const, label: 'Gradient' }],
    frameGradientPresets: [],
    frameBackgroundPalette: [],
    frameBackgroundImageFitOptions: [{ value: 'cover' as const, label: 'Cover' }],
    recentColors: [],
    toNumber: (value: string) => Number(value),
    setFrameDraft: vi.fn(),
    applyGradientPreset: vi.fn(),
    onPickBackgroundImage: vi.fn(),
    clearBackgroundImage: vi.fn(),
    onApplyFrame: vi.fn(),
    ...overrides,
  };
}

it('passes optional source image style options only when frame section receives them', () => {
  renderToStaticMarkup(renderEditorInspectorFrameSection(createFrameSectionProps()));
  expect(framePanelProps).toHaveBeenLastCalledWith(
    expect.not.objectContaining({
      lineStyleOptions: expect.anything(),
      shapeStrokePalette: expect.anything(),
    })
  );

  const lineStyleOptions = [{ value: 'dot' as const, label: 'Dot' }];
  renderToStaticMarkup(
    renderEditorInspectorFrameSection(
      createFrameSectionProps({ lineStyleOptions, shapeStrokePalette: ['#111111'] }) as never
    )
  );

  expect(framePanelProps).toHaveBeenLastCalledWith(
    expect.objectContaining({
      lineStyleOptions,
      shapeStrokePalette: ['#111111'],
    })
  );
  const frameProps = framePanelProps.mock.lastCall?.[0] as Record<string, (value: never) => void>;
  frameProps['setLayoutMode']?.('fit-image' as never);
  frameProps['setBackgroundMode']?.('color' as never);
  frameProps['previewFramePatch']?.({ paddingTop: 1 } as never);
  frameProps['applyFramePatch']?.({ paddingTop: 2 } as never);
});

it('renders size sections and creates resize actions through controller adapters', () => {
  const setDraft = vi.fn();
  const setLocked = vi.fn();
  const updateLockedDraft = vi.fn((state) => state);
  const controller = {
    resizeCanvas: vi.fn(),
    resizeImage: vi.fn(),
  };

  renderToStaticMarkup(
    renderEditorInspectorSizeSection({
      label: 'Layer',
      valueText: '160 x 120',
      draft: { width: 160, height: 120 },
      locked: false,
      aspectRatio: 4 / 3,
      setDraft,
      setLocked,
      updateLockedDraft,
      onApply: vi.fn(),
    })
  );
  const sizeProps = sizePanelProps.mock.lastCall?.[0] as Record<string, (value: never) => void>;
  sizeProps['onWidthChange']?.(200 as never);
  sizeProps['onHeightChange']?.(100 as never);
  sizeProps['onToggleLock']?.(undefined as never);
  createResizeImageAction(controller, 1, 2)();
  createResizeCanvasAction(controller, 3, 4)();

  expect(controller.resizeImage).toHaveBeenCalledWith(1, 2);
  expect(setDraft).toHaveBeenCalledTimes(2);
  expect(setLocked).toHaveBeenCalledOnce();
  expect(controller.resizeCanvas).toHaveBeenCalledWith(3, 4);
  expect(getImageSizeSectionLabel()).toBeTruthy();
  expect(getCanvasSizeSectionLabel()).toBeTruthy();
});
