// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioImageElement,
  createScenarioSlide,
} from '../../../features/scenario/project/v3';
import { translate } from '../../../platform/i18n';
import type { ScenarioSlideRenderAssetMap } from '../../project/stage-render/slide';
import { ScenarioSlideRail } from './panel';
import { moveScenarioSlideByDirection } from './reorder';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const assets: ScenarioSlideRenderAssetMap = new Map([
  [
    'asset-1',
    {
      height: 720,
      source: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
      width: 1280,
    },
  ],
]);

function createSlides() {
  const image = createScenarioImageElement({
    assetRef: { assetId: 'asset-1', galleryAssetId: null },
    name: 'Captured app',
  });
  return [
    { ...createScenarioSlide({ elements: [image], title: 'Intro' }), id: 'slide-1' },
    { ...createScenarioSlide({ title: 'Details' }), id: 'slide-2' },
  ];
}

function renderRail(assetMap: ScenarioSlideRenderAssetMap = assets, slides = createSlides()) {
  const actions = {
    onAddSlide: vi.fn(),
    onDeleteSlide: vi.fn(),
    onDuplicateSlide: vi.fn(),
    onMoveSlide: vi.fn(),
    onSelectSlide: vi.fn(),
  };
  act(() => {
    root?.render(
      <ScenarioSlideRail assets={assetMap} {...actions} selectedSlideId="slide-2" slides={slides} />
    );
  });
  return actions;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('keeps only guide step actions and routes them through the rail owner', () => {
  const actions = renderRail();

  click(translate('scenario.editor.addStep'));
  click(translate('scenario.editor.moveStepUp'));
  click(translate('scenario.editor.duplicateStep'));
  click(translate('scenario.editor.deleteStep'));
  act(() => container?.querySelector<HTMLButtonElement>('button.grid')?.click());

  expect(actions.onAddSlide).toHaveBeenCalledOnce();
  expect(actions.onMoveSlide).toHaveBeenCalledWith('slide-1', 'up');
  expect(actions.onDuplicateSlide).toHaveBeenCalledWith('slide-1');
  expect(actions.onDeleteSlide).toHaveBeenCalledWith('slide-1');
  expect(actions.onSelectSlide).toHaveBeenCalledWith('slide-1');
  expect(container?.textContent).toContain(translate('scenario.editor.steps'));
  expect(container?.textContent).not.toContain(translate('scenario.editor.layouts'));
  expect(container?.querySelector('[data-ui="scenario.templates.picker"]')).toBeNull();
});

it('renders screenshot thumbnails without presentation badges', () => {
  renderRail();
  const thumbnail = container?.querySelector<HTMLImageElement>(
    `img[alt="${translate('scenario.editor.slideThumbnailAlt')}"]`
  );

  expect(thumbnail?.src).toContain('data:image/svg+xml');
  expect(decodeURIComponent(thumbnail?.src ?? '')).toContain('data:image/png;base64');
  expect(container?.textContent).not.toContain(translate('scenario.editor.transitionFade'));
});

it('labels a step without a title as untitled', () => {
  const slides = createSlides();
  renderRail(assets, [{ ...slides[0]!, title: '' }, slides[1]!]);

  expect(container?.textContent).toContain(translate('scenario.editor.untitledStep'));
});

it('moves steps without mutating the source sequence', () => {
  const slides = createSlides();
  const moved = moveScenarioSlideByDirection({ direction: 'down', slideId: 'slide-1', slides });

  expect(moved.map((slide) => slide.id)).toEqual(['slide-2', 'slide-1']);
  expect(slides.map((slide) => slide.id)).toEqual(['slide-1', 'slide-2']);
});

function click(label: string) {
  const button = container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  act(() => button?.click());
}
