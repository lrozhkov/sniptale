// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../platform/i18n';
import {
  createScenarioImageElement,
  createScenarioSlide,
} from '../../features/scenario/project/v3';
import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { ScenarioCanvasStage } from './stage';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createCanvasImageSlide(): ScenarioSlide {
  const image = {
    ...createScenarioImageElement({
      assetRef: { assetId: 'asset-1', galleryAssetId: null },
      contentTransform: { scale: 1, x: 0, y: 0 },
      frame: { height: 240, width: 360, x: 120, y: 140 },
    }),
    id: 'image-1',
  };

  return createScenarioSlide({
    elements: [image],
    title: 'Image',
  });
}

function renderStage(props: Partial<Parameters<typeof ScenarioCanvasStage>[0]> = {}) {
  const onSelectElement = vi.fn();
  const onSelectSlide = vi.fn();
  const onDeleteElement = vi.fn();
  const onUpdateElement = vi.fn();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioCanvasStage
        onDeleteElement={onDeleteElement}
        onSelectElement={onSelectElement}
        onSelectSlide={onSelectSlide}
        onUpdateElement={onUpdateElement}
        selectedElementId="image-1"
        slide={createCanvasImageSlide()}
        {...props}
      />
    );
  });

  return {
    onDeleteElement,
    onSelectElement,
    onSelectSlide,
    onUpdateElement,
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function pointerEvent(type: string, clientX: number, clientY: number) {
  return new PointerEvent(type, { bubbles: true, clientX, clientY });
}

it('commits image content pan and zoom controls from the canvas', () => {
  const { onUpdateElement } = renderStage();
  const pan = container?.querySelector<HTMLElement>(
    `[aria-label="${translate('scenario.editor.panImageContent')}"] span`
  );
  const stage = container?.querySelector<HTMLDivElement>('[data-ui="scenario.canvas.stage"]');

  act(() => {
    pan?.dispatchEvent(pointerEvent('pointerdown', 10, 10));
  });
  act(() => {
    stage?.dispatchEvent(pointerEvent('pointerup', 34, 46));
  });
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>(
        `[aria-label="${translate('scenario.editor.zoomImageContentIn')}"]`
      )
      ?.click();
  });

  expect(onUpdateElement).toHaveBeenCalledWith('image-1', {
    contentTransform: { scale: 1, x: 24, y: 36 },
  });
  expect(onUpdateElement).toHaveBeenCalledWith('image-1', {
    contentTransform: { scale: 1.1, x: 0, y: 0 },
  });
});

it('zooms selected image content from the canvas wheel without selecting the slide', () => {
  const { onSelectSlide, onUpdateElement } = renderStage();
  const stage = container?.querySelector<HTMLDivElement>('[data-ui="scenario.canvas.stage"]');
  const wheelEvent = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: -10,
  });

  act(() => {
    stage?.dispatchEvent(wheelEvent);
  });

  expect(wheelEvent.defaultPrevented).toBe(true);
  expect(onSelectSlide).not.toHaveBeenCalled();
  expect(onUpdateElement).toHaveBeenCalledWith('image-1', {
    contentTransform: { scale: 1.1, x: 0, y: 0 },
  });
});

it('keeps the selected image active when clicking canvas image controls', () => {
  const { onSelectSlide } = renderStage();
  const zoomIn = container?.querySelector<HTMLButtonElement>(
    `[aria-label="${translate('scenario.editor.zoomImageContentIn')}"]`
  );

  act(() => {
    zoomIn?.dispatchEvent(pointerEvent('pointerdown', 10, 10));
  });
  act(() => {
    zoomIn?.dispatchEvent(pointerEvent('pointerup', 10, 10));
  });

  expect(onSelectSlide).not.toHaveBeenCalled();
});

it('renders a selected image canvas edit button that opens the embedded editor', () => {
  const onEditImageElement = vi.fn();
  renderStage({ onEditImageElement });

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>(`[aria-label="${translate('scenario.editor.editImage')}"]`)
      ?.click();
  });

  expect(onEditImageElement).toHaveBeenCalledWith('image-1');
});
