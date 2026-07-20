// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorInspectorResizeToolSection } from './resize-tool';
import { useCanvasResizePreview } from './resize-tool-preview';

vi.mock('@sniptale/ui/segmented-switch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/segmented-switch')>()),
  SegmentedSwitch: () => <div />,
}));

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  CompactSelect: () => <select />,
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createController() {
  return {
    applyCropSelection: vi.fn(async () => undefined),
    clearCanvasSizePreview: vi.fn(),
    clearCropSelection: vi.fn(),
    previewCanvasSize: vi.fn(),
    resizeCanvas: vi.fn(),
    resizeImage: vi.fn(),
    setCropSelectionMouseEnabled: vi.fn(),
  };
}

function renderResizeTool(
  controller: ReturnType<typeof createController>,
  options: {
    canvasSizeDraft?: { height: number; width: number };
    canvasSize?: { height: number; width: number };
    cropReady?: boolean;
    cropSelection?: { height: number; width: number } | null;
  } = {}
) {
  const Harness = () => {
    const [canvasSizeDraft, setCanvasSizeDraft] = useState(
      options.canvasSizeDraft ?? { height: 900, width: 1200 }
    );
    const [imageSizeDraft, setImageSizeDraft] = useState({ height: 1000, width: 1000 });
    const [canvasSizeLocked, setCanvasSizeLocked] = useState(false);
    const [imageSizeLocked, setImageSizeLocked] = useState(true);

    return (
      <EditorInspectorResizeToolSection
        canvasAspectRatio={4 / 3}
        canvasSize={options.canvasSize ?? { height: 900, width: 1200 }}
        canvasSizeDraft={canvasSizeDraft}
        canvasSizeLocked={canvasSizeLocked}
        canvasSizeText="1200 x 900"
        controller={controller}
        cropReady={options.cropReady ?? false}
        cropSelection={options.cropSelection ?? null}
        imageAspectRatio={1}
        imageSizeDraft={imageSizeDraft}
        imageSizeLocked={imageSizeLocked}
        imageSizeText="1000 x 1000"
        setCanvasSizeDraft={setCanvasSizeDraft}
        setCanvasSizeLocked={setCanvasSizeLocked}
        setImageSizeDraft={setImageSizeDraft}
        setImageSizeLocked={setImageSizeLocked}
        updateLockedDraft={(state, field, value) => ({ ...state, [field]: value })}
      />
    );
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

it('does not re-preview the crop selection that was just drawn on the canvas', () => {
  const controller = createController();
  renderResizeTool(controller, {
    canvasSizeDraft: { height: 600, width: 900 },
    canvasSize: { height: 900, width: 1200 },
    cropReady: true,
    cropSelection: { height: 600, width: 900 },
  });

  expect(controller.previewCanvasSize).not.toHaveBeenCalled();
});

it('does not clear the canvas crop guide when active selection dimensions rerender', () => {
  const controller = createController();
  const Harness = ({ cropSelection }: { cropSelection: { height: number; width: number } }) => {
    const [draft, setDraft] = useState({ height: 600, width: 900 });
    const [imageDraft, setImageDraft] = useState({ height: 1000, width: 1000 });
    const [locked, setLocked] = useState(false);
    const [imageLocked, setImageLocked] = useState(true);

    return (
      <EditorInspectorResizeToolSection
        canvasAspectRatio={4 / 3}
        canvasSize={{ height: 900, width: 1200 }}
        canvasSizeDraft={draft}
        canvasSizeLocked={locked}
        canvasSizeText="1200 x 900"
        controller={controller}
        cropReady
        cropSelection={cropSelection}
        imageAspectRatio={1}
        imageSizeDraft={imageDraft}
        imageSizeLocked={imageLocked}
        imageSizeText="1000 x 1000"
        setCanvasSizeDraft={setDraft}
        setCanvasSizeLocked={setLocked}
        setImageSizeDraft={setImageDraft}
        setImageSizeLocked={setImageLocked}
        updateLockedDraft={(state, field, value) => ({ ...state, [field]: value })}
      />
    );
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => root?.render(<Harness cropSelection={{ height: 600, width: 900 }} />));
  controller.clearCanvasSizePreview.mockClear();
  controller.previewCanvasSize.mockClear();

  act(() => root?.render(<Harness cropSelection={{ height: 620, width: 940 }} />));

  expect(controller.clearCanvasSizePreview).not.toHaveBeenCalled();
  expect(controller.previewCanvasSize).not.toHaveBeenCalled();
});

it('clears canvas previews and disables crop pointer ownership outside canvas mode', () => {
  const controller = createController();
  const HookProbe = () => {
    useCanvasResizePreview({
      canvasSizeDraft: { height: 700, width: 1000 },
      canvasSizeMatchesDraft: false,
      controller,
      cropSelection: null,
      cropSelectionMatchesDraft: false,
      isCanvasMode: false,
    });
    return null;
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<HookProbe />));

  expect(controller.setCropSelectionMouseEnabled).toHaveBeenCalledWith(false);
  expect(controller.clearCanvasSizePreview).toHaveBeenCalled();
  expect(controller.clearCropSelection).toHaveBeenCalled();

  act(() => root?.unmount());

  expect(controller.setCropSelectionMouseEnabled).toHaveBeenCalledWith(true);
});
