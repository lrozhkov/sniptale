// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ScenarioSlideRenderResult } from '../project/stage-render/slide';
import { translate } from '../../platform/i18n';
import {
  createScenarioCanvasNavigatorFrameStyle,
  navigateScenarioCanvasViewport,
  readScenarioCanvasNavigatorMetrics,
  ScenarioCanvasNavigator,
} from './navigator';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createRenderedSlide(): ScenarioSlideRenderResult {
  return {
    canvas: { height: 90, width: 160 },
    elements: [],
    missingAssets: [],
    selectionBoxes: [],
    slide: { id: 'slide-1' },
    svg: '<svg width="160" height="90"></svg>',
  } as unknown as ScenarioSlideRenderResult;
}

function createViewportFixture() {
  const viewport = document.createElement('div');
  const frame = document.createElement('div');
  defineMetric(viewport, 'clientHeight', 120);
  defineMetric(viewport, 'clientWidth', 160);
  defineMetric(viewport, 'scrollHeight', 520);
  defineMetric(viewport, 'scrollWidth', 720);
  defineWritableMetric(viewport, 'scrollLeft', 80);
  defineWritableMetric(viewport, 'scrollTop', 40);
  defineMetric(frame, 'offsetHeight', 360);
  defineMetric(frame, 'offsetLeft', 24);
  defineMetric(frame, 'offsetTop', 32);
  defineMetric(frame, 'offsetWidth', 640);

  return { frame, viewport };
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

it('derives the navigator viewport frame and navigates by relative position', () => {
  const { frame, viewport } = createViewportFixture();
  const metrics = readScenarioCanvasNavigatorMetrics({
    scaledFrameRef: { current: frame },
    viewportRef: { current: viewport },
  });

  expect(metrics).toEqual(
    expect.objectContaining({ frameHeight: 360, frameWidth: 640, viewportWidth: 160 })
  );
  expect(createScenarioCanvasNavigatorFrameStyle(metrics!, { height: 90, width: 160 })).toEqual(
    expect.objectContaining({ height: '30px', left: '14px', top: '2px', width: '40px' })
  );

  navigateScenarioCanvasViewport({
    metrics: metrics!,
    relativeX: 0.75,
    relativeY: 0.5,
    viewport,
  });

  expect(viewport.scrollLeft).toBe(424);
  expect(viewport.scrollTop).toBe(152);
});

it('fails closed when navigator geometry is incomplete or degenerate', () => {
  const { frame, viewport } = createViewportFixture();

  expect(
    readScenarioCanvasNavigatorMetrics({
      scaledFrameRef: { current: frame },
      viewportRef: { current: null },
    })
  ).toBeNull();
  expect(
    readScenarioCanvasNavigatorMetrics({
      scaledFrameRef: { current: null },
      viewportRef: { current: viewport },
    })
  ).toBeNull();

  const metrics = readScenarioCanvasNavigatorMetrics({
    scaledFrameRef: { current: frame },
    viewportRef: { current: viewport },
  })!;
  expect(
    createScenarioCanvasNavigatorFrameStyle(
      { ...metrics, frameWidth: 0 },
      { height: 90, width: 160 }
    )
  ).toBeNull();
  expect(
    createScenarioCanvasNavigatorFrameStyle(
      { ...metrics, frameHeight: 0 },
      { height: 90, width: 160 }
    )
  ).toBeNull();
});

it('renders the navigator preview and handles pointer navigation', () => {
  const { frame, viewport } = createViewportFixture();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioCanvasNavigator
        rendered={createRenderedSlide()}
        scaledFrameRef={{ current: frame }}
        viewportRef={{ current: viewport }}
      />
    );
  });

  const surface = container.querySelector<HTMLDivElement>(
    `[aria-label="${translate('scenario.editor.navigator')}"]`
  );
  expect(surface).not.toBeNull();
  expect(container.querySelector('[data-ui="scenario.canvas.navigator"]')).not.toBeNull();
  expect(decodeURIComponent(container.querySelector('img')?.getAttribute('src') ?? '')).toContain(
    '<svg width="160" height="90"></svg>'
  );

  vi.spyOn(surface!, 'getBoundingClientRect').mockReturnValue({
    bottom: 90,
    height: 90,
    left: 0,
    right: 160,
    toJSON: () => ({}),
    top: 0,
    width: 160,
    x: 0,
    y: 0,
  });
  act(() => {
    surface?.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: 120, clientY: 45 })
    );
  });

  expect(viewport.scrollLeft).toBe(424);
  expect(viewport.scrollTop).toBe(152);
});

function defineMetric(element: HTMLElement, key: string, value: number) {
  Object.defineProperty(element, key, { configurable: true, value });
}

function defineWritableMetric(element: HTMLElement, key: string, value: number) {
  let current = value;
  Object.defineProperty(element, key, {
    configurable: true,
    get: () => current,
    set: (next: number) => {
      current = next;
    },
  });
}
