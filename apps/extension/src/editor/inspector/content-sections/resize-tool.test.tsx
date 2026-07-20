// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
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

it('keeps image resize free of mouse selection preview and applies a flattened image resize action', () => {
  const controller = createController();
  renderResizeTool(controller);

  expect(controller.previewCanvasSize).not.toHaveBeenCalled();
  expect(controller.setCropSelectionMouseEnabled).toHaveBeenLastCalledWith(true);

  act(() => {
    getButton(translate('editor.compact.image')).click();
  });

  expect(controller.clearCanvasSizePreview).toHaveBeenCalledOnce();
  expect(controller.clearCropSelection).toHaveBeenCalledOnce();
  expect(controller.setCropSelectionMouseEnabled).toHaveBeenLastCalledWith(false);

  act(() => {
    getButton(translate('editor.compact.apply')).click();
  });

  expect(controller.resizeImage).toHaveBeenCalledWith(1000, 1000);
  expect(controller.resizeCanvas).not.toHaveBeenCalled();
});

it('previews canvas size only after the user changes dimensions', () => {
  const controller = createController();
  renderResizeTool(controller);

  const applyButton = getButton(translate('editor.compact.apply'));
  expect(applyButton.disabled).toBe(true);
  expect(controller.previewCanvasSize).not.toHaveBeenCalled();

  act(() => {
    getSelect(translate('editor.compact.sizePreset')).value = '1920x1080';
    getSelect(translate('editor.compact.sizePreset')).dispatchEvent(
      new Event('change', { bubbles: true })
    );
  });

  expect(controller.previewCanvasSize).toHaveBeenLastCalledWith(1920, 1080);
  expect(applyButton.disabled).toBe(false);

  act(() => {
    applyButton.click();
  });

  expect(controller.resizeCanvas).toHaveBeenCalledWith(1920, 1080);
});

it('applies selected aspect ratio by larger or smaller side from the current draft', () => {
  const controller = createController();
  renderResizeTool(controller);

  act(() => {
    getSelect(translate('editor.compact.aspectRatioPreset')).value = '16:9';
    getSelect(translate('editor.compact.aspectRatioPreset')).dispatchEvent(
      new Event('change', { bubbles: true })
    );
  });

  act(() => {
    getButton(translate('editor.compact.fitAspectByShortSide')).click();
  });

  expect(getInput(translate('editor.compact.widthDimension')).value).toBe('1600');
  expect(getInput(translate('editor.compact.heightDimension')).value).toBe('900');
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
