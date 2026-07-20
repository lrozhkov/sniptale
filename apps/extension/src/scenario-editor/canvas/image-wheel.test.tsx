// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ScenarioRenderedElement } from '../project/stage-render/slide';
import { renderScenarioSlide } from '../project/stage-render/slide';
import {
  createScenarioImageElement,
  createScenarioSlide,
} from '../../features/scenario/project/v3';
import { useSelectedImageWheelZoom } from './image-wheel';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createRenderedImage(): ScenarioRenderedElement {
  const image = {
    ...createScenarioImageElement({
      assetRef: { assetId: 'asset-1', galleryAssetId: null },
      contentTransform: { scale: 1, x: 0, y: 0 },
      frame: { height: 240, width: 360, x: 120, y: 140 },
    }),
    id: 'image-1',
  };
  const slide = createScenarioSlide({
    elements: [image],
    title: 'Image',
  });
  const rendered = renderScenarioSlide(slide, {
    mode: 'editor',
    selectedElementIds: ['image-1'],
  }).elements[0];
  if (!rendered) {
    throw new Error('Expected rendered image element');
  }

  return rendered;
}

function renderWheelStage(selectedRenderedElement: ScenarioRenderedElement | null) {
  const onUpdateElement = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  function WheelStage() {
    const ref = useRef<HTMLDivElement>(null);
    useSelectedImageWheelZoom({ onUpdateElement, selectedRenderedElement, stageRef: ref });

    return <div ref={ref} data-testid="wheel-stage" />;
  }

  act(() => {
    root?.render(<WheelStage />);
  });

  return {
    onUpdateElement,
    stage: container.querySelector<HTMLDivElement>('[data-testid="wheel-stage"]'),
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

it('owns passive-safe wheel zoom for the selected image element', () => {
  const { onUpdateElement, stage } = renderWheelStage(createRenderedImage());
  const wheelEvent = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: -10,
  });

  act(() => {
    stage?.dispatchEvent(wheelEvent);
  });

  expect(wheelEvent.defaultPrevented).toBe(true);
  expect(onUpdateElement).toHaveBeenCalledWith('image-1', {
    contentTransform: { scale: 1.1, x: 0, y: 0 },
  });
});

it('leaves ordinary canvas wheel events untouched when no image is selected', () => {
  const { onUpdateElement, stage } = renderWheelStage(null);
  const wheelEvent = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: -10,
  });

  act(() => {
    stage?.dispatchEvent(wheelEvent);
  });

  expect(wheelEvent.defaultPrevented).toBe(false);
  expect(onUpdateElement).not.toHaveBeenCalled();
});
