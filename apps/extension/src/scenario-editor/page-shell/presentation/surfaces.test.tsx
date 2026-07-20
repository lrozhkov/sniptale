// @vitest-environment jsdom

import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioImageElement,
  createScenarioSlide,
} from '../../../features/scenario/project/v3';
import { translate } from '../../../platform/i18n';
import type { ScenarioSlideRenderAssetMap } from '../../project/stage-render/slide';
import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { ScenarioOverviewSurface } from './overview';
import { ScenarioDeckPlaySurface } from './play-surface';
import { ScenarioPresenterSurface } from './presenter';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createSlides(): ScenarioSlide[] {
  return [
    {
      ...createScenarioSlide({ notes: 'Opening notes', title: 'Intro' }),
      id: 'slide-1',
    },
    {
      ...createScenarioSlide({ notes: 'Next notes', title: 'Details' }),
      id: 'slide-2',
    },
  ];
}

function createImageSlide(id: string, assetId: string): ScenarioSlide {
  return {
    ...createScenarioSlide({ title: id }),
    elements: [
      {
        ...createScenarioImageElement({
          assetRef: { assetId, galleryAssetId: null },
        }),
        id: `${id}-image`,
      },
    ],
    id,
  };
}

function createAssets(): ScenarioSlideRenderAssetMap {
  return new Map([
    [
      'asset-1',
      {
        height: 720,
        source: 'data:image/png;base64,presentation',
        width: 1280,
      },
    ],
    [
      'asset-2',
      {
        height: 480,
        source: 'data:image/png;base64,next',
        width: 640,
      },
    ],
  ]);
}

function renderNode(node: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(node);
  });
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

it('renders overview tiles and jumps to a selected slide', () => {
  const onSelectSlide = vi.fn();

  renderNode(
    <ScenarioOverviewSurface
      onExit={vi.fn()}
      onSelectSlide={onSelectSlide}
      selectedSlideId="slide-2"
      slides={createSlides()}
    />
  );
  act(() => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
  });

  expect(container?.querySelector('[data-ui="scenario.editor.v3.overview"]')).not.toBeNull();
  expect(container?.textContent).toContain('1. Intro');
  expect(container?.textContent).toContain('Opening notes');
  expect(onSelectSlide).toHaveBeenCalledWith('slide-1');
});

it('advances and rewinds deck builds from play controls and keyboard', () => {
  const onNext = vi.fn();
  const onPrevious = vi.fn();
  const onExit = vi.fn();

  renderNode(
    <ScenarioDeckPlaySurface
      clickIndex={1}
      onExit={onExit}
      onNext={onNext}
      onPrevious={onPrevious}
      slide={{
        ...createSlides()[0]!,
        clicks: { count: 2, initialIndex: 0 },
        transition: { durationMs: 220, easing: 'ease', kind: 'slide' },
      }}
      slideIndex={0}
      slideTotal={2}
    />
  );
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>(`[aria-label="${translate('scenario.editor.next')}"]`)
      ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });

  expect(container?.querySelector('[data-ui="scenario.editor.v3.play"]')).not.toBeNull();
  expect(
    container?.querySelector('[data-ui="scenario.presentation.zoom-viewport"]')
  ).not.toBeNull();
  expect(container?.querySelector('[data-slide-transition="slide"]')).not.toBeNull();
  expect(container?.textContent).toContain('1/2');
  expect(decodeRenderedSvgs()).toContain('width="1080"');
  expect(onNext).toHaveBeenCalledTimes(1);
  expect(onPrevious).toHaveBeenCalledTimes(1);
  expect(onExit).toHaveBeenCalledTimes(1);
});

it('passes image assets into the play surface slide render', () => {
  renderNode(
    <ScenarioDeckPlaySurface
      assets={createAssets()}
      clickIndex={0}
      onExit={vi.fn()}
      onNext={vi.fn()}
      onPrevious={vi.fn()}
      slide={createImageSlide('slide-1', 'asset-1')}
      slideIndex={0}
      slideTotal={1}
    />
  );

  expect(decodeRenderedSvgs()).toContain('data:image/png;base64,presentation');
});

it('renders presenter current slide, next preview, notes, and timer', () => {
  renderNode(
    <ScenarioPresenterSurface
      assets={createAssets()}
      audienceOpening={false}
      clickIndex={0}
      elapsedSeconds={65}
      nextSlide={createImageSlide('slide-2', 'asset-2')}
      onExit={vi.fn()}
      onNext={vi.fn()}
      onOpenAudienceScreen={vi.fn()}
      onPrevious={vi.fn()}
      slide={createImageSlide('slide-1', 'asset-1')}
      slideIndex={0}
      slideTotal={2}
    />
  );

  expect(container?.querySelector('[data-ui="scenario.editor.v3.presenter"]')).not.toBeNull();
  expect(
    container?.querySelector('[data-ui="scenario.presentation.zoom-viewport"]')
  ).not.toBeNull();
  expect(container?.textContent).toContain('01:05');
  expect(decodeRenderedSvgs()).toContain('data:image/png;base64,presentation');
  expect(decodeRenderedSvgs()).toContain('data:image/png;base64,next');
  expect(container?.textContent).toContain('Следующий слайд');
});

it('passes image assets into overview thumbnails', () => {
  renderNode(
    <ScenarioOverviewSurface
      assets={createAssets()}
      onExit={vi.fn()}
      onSelectSlide={vi.fn()}
      selectedSlideId="slide-1"
      slides={[createImageSlide('slide-1', 'asset-1')]}
    />
  );

  expect(decodeRenderedSvgs()).toContain('data:image/png;base64,presentation');
});

function decodeRenderedSvgs() {
  return Array.from(container?.querySelectorAll<HTMLImageElement>('img') ?? [])
    .map((image) =>
      decodeURIComponent(
        (image.getAttribute('src') ?? '').replace(/^data:image\/svg\+xml;charset=utf-8,/, '')
      )
    )
    .join('\n');
}
