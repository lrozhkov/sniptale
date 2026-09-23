// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { updateLockedDraft } from '../sidebar-shared/frame';
import { translate } from '../../../platform/i18n';
import { EditorInspectorResizeToolSection, fitSizeDraftToAspectRatio } from './resize-tool';
import {
  applyCurrentAspectRatio,
  applySelectedAspectRatio,
  applySizePreset,
  buildAspectRatioOptions,
  buildSizePresetOptions,
  findAspectRatioValue,
  findPresetValue,
} from './resize-tool-options';

vi.mock('@sniptale/ui/segmented-switch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/segmented-switch')>()),
  SegmentedSwitch: (props: {
    activeId: string;
    options: { id: string; label: string }[];
    onChange: (id: 'canvas' | 'image') => void;
  }) => (
    <div>
      {props.options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={props.activeId === option.id}
          onClick={() => props.onChange(option.id as 'canvas' | 'image')}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  SelectField: (props: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { label: string; value: string }[];
  }) => (
    <select
      aria-label={props.label}
      value={props.value}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createController() {
  return {
    applyCropSelection: vi.fn(async () => undefined),
    cancelCropMode: vi.fn(),
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
    imageSizeDraft?: { height: number; width: number };
    mode?: 'canvas' | 'image';
  } = {}
) {
  const Harness = () => {
    const [canvasSizeDraft, setCanvasSizeDraft] = useState(
      options.canvasSizeDraft ?? { height: 900, width: 1200 }
    );
    const [imageSizeDraft, setImageSizeDraft] = useState(
      options.imageSizeDraft ?? { height: 1000, width: 1000 }
    );
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
        mode={options.mode ?? 'canvas'}
        setCanvasSizeDraft={setCanvasSizeDraft}
        setCanvasSizeLocked={setCanvasSizeLocked}
        setImageSizeDraft={setImageSizeDraft}
        setImageSizeLocked={setImageSizeLocked}
        updateLockedDraft={updateLockedDraft}
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

it('keeps image resize free of mouse selection preview and applies a flattened image resize action', () => {
  const controller = createController();
  renderResizeTool(controller, { imageSizeDraft: { height: 900, width: 900 }, mode: 'image' });

  expect(controller.previewCanvasSize).not.toHaveBeenCalled();
  expect(controller.setCropSelectionMouseEnabled).toHaveBeenLastCalledWith(false);

  expect(controller.clearCanvasSizePreview).toHaveBeenCalledOnce();
  expect(controller.clearCropSelection).toHaveBeenCalledOnce();
  expect(controller.setCropSelectionMouseEnabled).toHaveBeenLastCalledWith(false);

  act(() => {
    getButton(translate('editor.compact.applyImageSize')).click();
  });

  expect(controller.resizeImage).toHaveBeenCalledWith(900, 900);
  expect(controller.resizeCanvas).not.toHaveBeenCalled();
});

it('keeps apply disabled when the selected image size is unchanged', () => {
  const controller = createController();
  renderResizeTool(controller, { mode: 'image' });

  const applyButton = getButton(translate('editor.compact.applyImageSize'));
  expect(applyButton.disabled).toBe(true);

  act(() => {
    applyButton.click();
  });
  expect(controller.resizeImage).not.toHaveBeenCalled();
});

it('labels image scaling separately and disables invalid dimensions', () => {
  const controller = createController();
  renderResizeTool(controller, { imageSizeDraft: { height: 900, width: 0 }, mode: 'image' });

  expect(container?.querySelector('section')?.getAttribute('aria-label')).toBe(
    translate('editor.compact.imageSize')
  );
  expect(container?.textContent).not.toContain(translate('editor.compact.cropCanvasHint'));
  expect(container?.querySelector('[role="alert"]')?.textContent).toBe(
    translate('editor.compact.invalidImageDimensions')
  );
  expect(getButton(translate('editor.compact.applyImageSize')).disabled).toBe(true);
});

it('previews a crop area after the user changes its aspect ratio', () => {
  const controller = createController();
  renderResizeTool(controller);

  const applyButton = getButton(translate('editor.compact.applyCropCanvas'));
  expect(applyButton.disabled).toBe(true);
  expect(controller.previewCanvasSize).not.toHaveBeenCalled();

  act(() => {
    getSelect(translate('editor.compact.aspectRatioPreset')).value = '16:9';
    getSelect(translate('editor.compact.aspectRatioPreset')).dispatchEvent(
      new Event('change', { bubbles: true })
    );
  });
  expect(controller.previewCanvasSize).toHaveBeenLastCalledWith(1200, 675);
  expect(applyButton.disabled).toBe(false);

  act(() => {
    applyButton.click();
  });

  expect(controller.resizeCanvas).toHaveBeenCalledWith(1200, 675);
});

it('leaves crop mode from the secondary cancel action', () => {
  const controller = createController();
  renderResizeTool(controller);

  act(() => {
    getButton(translate('common.actions.cancel')).click();
  });

  expect(controller.cancelCropMode).toHaveBeenCalledOnce();
});

it('applies a selected crop through the crop controller path', async () => {
  const controller = createController();
  renderResizeTool(controller, {
    cropReady: true,
    cropSelection: { height: 600, width: 800 },
  });

  expect(container?.textContent).toContain(translate('editor.compact.cropReadyDescription'));
  await act(async () => getButton(translate('editor.compact.applyCropCanvas')).click());
  expect(controller.applyCropSelection).toHaveBeenCalledOnce();
  expect(controller.resizeCanvas).not.toHaveBeenCalled();
});

it('applies the chosen ratio immediately without a second fitting command', () => {
  const controller = createController();
  renderResizeTool(controller);

  act(() => {
    getSelect(translate('editor.compact.aspectRatioPreset')).value = '16:9';
    getSelect(translate('editor.compact.aspectRatioPreset')).dispatchEvent(
      new Event('change', { bubbles: true })
    );
  });

  expect(container?.textContent).not.toContain(translate('editor.compact.fitAspectByShortSide'));

  expect(getInput(translate('editor.compact.widthDimension')).value).toBe('1200');
  expect(getInput(translate('editor.compact.heightDimension')).value).toBe('675');
});

it('applies an aspect ratio to the current size by larger or smaller side', () => {
  expect(fitSizeDraftToAspectRatio({ height: 1000, width: 700 }, 16 / 9, 'long')).toEqual({
    height: 563,
    width: 1000,
  });
  expect(fitSizeDraftToAspectRatio({ height: 1000, width: 700 }, 16 / 9, 'short')).toEqual({
    height: 700,
    width: 1244,
  });
  expect(fitSizeDraftToAspectRatio({ height: 700, width: 1000 }, 9 / 16, 'long')).toEqual({
    height: 1000,
    width: 563,
  });
  expect(fitSizeDraftToAspectRatio({ height: 0, width: 0 }, 0, 'short')).toEqual({
    height: 1000,
    width: 1,
  });
});

it('resolves size and aspect-ratio presets including custom branches', () => {
  const setDraft = vi.fn((updater) => {
    if (typeof updater === 'function') {
      return updater({ height: 900, width: 1200 });
    }
    return updater;
  });

  expect(findPresetValue({ height: 1080, width: 1920 })).toBe('1920x1080');
  expect(findPresetValue({ height: 111, width: 222 })).toBeNull();
  expect(buildSizePresetOptions('custom')[0]?.value).toBe('custom');
  expect(buildSizePresetOptions('1920x1080')[0]?.value).toBe('3840x2160');
  applySizePreset(setDraft, '1280x720');
  applySizePreset(setDraft, 'missing');
  expect(setDraft).toHaveBeenCalledWith({ height: 720, width: 1280 });

  expect(findAspectRatioValue({ height: 900, width: 1600 })).toBe('16:9');
  expect(findAspectRatioValue({ height: 777, width: 1000 })).toBeNull();
  expect(buildAspectRatioOptions('custom')[0]?.value).toBe('custom');
  applySelectedAspectRatio(setDraft, '1:1');
  applyCurrentAspectRatio(setDraft, '9:16', 'short');
  applyCurrentAspectRatio(setDraft, 'missing', 'long');
  expect(setDraft).toHaveBeenCalledTimes(3);
});

function getButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find(
    (item) => item.textContent === label
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button ${label}`);
  }

  return button;
}

function getInput(label: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) {
    throw new Error(`Expected input ${label}`);
  }

  return input;
}

function getSelect(label: string): HTMLSelectElement {
  const select = document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (!select) {
    throw new Error(`Expected select ${label}`);
  }

  return select;
}

it('keeps a selected preset ratio during locked dimension edits', () => {
  renderResizeTool(createController(), { mode: 'image' });
  act(() => {
    const select = getSelect(translate('editor.compact.sizePreset'));
    select.value = '1920x1080';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const input = getInput(translate('editor.compact.widthDimension'));
  act(() => input.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '960');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(getInput(translate('editor.compact.heightDimension')).value).toBe('540');
  expect(getSelect(translate('editor.compact.aspectRatioPreset')).value).toBe('16:9');
});
