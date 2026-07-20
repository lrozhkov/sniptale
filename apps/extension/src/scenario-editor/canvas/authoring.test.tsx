// @vitest-environment jsdom

import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../platform/i18n';
import {
  createScenarioImageElement,
  createScenarioSlide,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { ScenarioCanvasStage } from './stage';
import type { ScenarioCanvasViewportController } from './viewport-state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createAuthoringSlide(): ScenarioSlide {
  const textElement = {
    ...createScenarioTextElement({
      frame: { height: 80, width: 260, x: 100, y: 120 },
      text: 'Title',
    }),
    id: 'text-1',
  };

  return createScenarioSlide({ elements: [textElement], title: 'Canvas' });
}

function createImageSlide(): ScenarioSlide {
  const image = {
    ...createScenarioImageElement({
      assetRef: { assetId: 'asset-1', galleryAssetId: null },
      frame: { height: 240, width: 360, x: 120, y: 140 },
    }),
    id: 'image-1',
  };

  return createScenarioSlide({ elements: [image], title: 'Image' });
}

function renderStage(props: Partial<Parameters<typeof ScenarioCanvasStage>[0]> = {}) {
  const callbacks = {
    onDeleteElement: vi.fn(),
    onSelectElement: vi.fn(),
    onSelectSlide: vi.fn(),
    onUpdateElement: vi.fn(),
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioCanvasStage
        {...callbacks}
        selectedElementId={null}
        slide={createAuthoringSlide()}
        {...props}
      />
    );
  });

  return callbacks;
}

function createExternalViewportController(
  overrides: Partial<ScenarioCanvasViewportController> = {}
): ScenarioCanvasViewportController {
  return {
    controls: {
      gridVisible: true,
      magnetEnabled: false,
      onFit: vi.fn(),
      onSetGridVisible: vi.fn(),
      onSetMagnetEnabled: vi.fn(),
      onSetSnapToGrid: vi.fn(),
      onZoomIn: vi.fn(),
      onZoomOut: vi.fn(),
      onZoomOne: vi.fn(),
      scale: 1,
      snapToGrid: false,
      zoomMode: 'fit',
    },
    gridVisible: true,
    magnetEnabled: false,
    scale: 1,
    snapToGrid: false,
    viewportRef: createRef<HTMLDivElement>(),
    ...overrides,
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

it('renders the blank slide placeholder', () => {
  renderStage({ slide: createScenarioSlide({ elements: [], title: 'Blank' }) });

  expect(container?.querySelector('[data-ui="scenario.canvas.empty-state"]')).not.toBeNull();
});

it('renders loading and missing asset states with localized copy', () => {
  renderStage({ assetsLoading: true, selectedElementId: 'image-1', slide: createImageSlide() });

  expect(container?.querySelector('[data-ui="scenario.canvas.asset-state"]')?.textContent).toBe(
    translate('scenario.editor.loadingAssets')
  );
});

it('renders missing image placeholders through the shared slide renderer', () => {
  renderStage({ selectedElementId: 'image-1', slide: createImageSlide() });

  expect(container?.querySelector('[data-ui="scenario.canvas.asset-state"]')?.textContent).toBe(
    translate('scenario.editor.missingAssets')
  );
  expect(decodeURIComponent(container?.querySelector('img')?.src ?? '')).toContain(
    translate('scenario.editor.missingImage')
  );
});

it('uses marquee selection on empty slide space as multi-select foundation', () => {
  const { onSelectElement } = renderStage();
  const stage = container?.querySelector<HTMLDivElement>('[data-ui="scenario.canvas.stage"]');

  act(() => {
    stage?.dispatchEvent(pointerEvent('pointerdown', 80, 100));
    stage?.dispatchEvent(pointerEvent('pointermove', 420, 260));
    stage?.dispatchEvent(pointerEvent('pointerup', 420, 260));
  });

  expect(container?.querySelector('[data-ui="scenario.canvas.marquee"]')).toBeNull();
  expect(onSelectElement).toHaveBeenCalledWith('text-1');
});

it('fits the slide and keeps pointer movement correct under scaled zoom', () => {
  const rectSpy = mockCanvasViewportRect();
  const { onUpdateElement } = renderStage();
  const overlay = getElementOverlay();
  const stage = container?.querySelector<HTMLDivElement>('[data-ui="scenario.canvas.stage"]');

  act(() => {
    overlay.dispatchEvent(pointerEvent('pointerdown', 10, 10));
  });
  act(() => {
    stage?.dispatchEvent(pointerEvent('pointermove', 65, 65));
  });
  act(() => {
    stage?.dispatchEvent(pointerEvent('pointerup', 65, 65));
  });

  expect(container?.querySelector('[data-ui="scenario.canvas.controls"]')?.textContent).toContain(
    '55%'
  );
  expect(onUpdateElement).toHaveBeenCalledWith('text-1', {
    frame: expect.objectContaining({ x: 200, y: 220 }),
  });
  rectSpy.mockRestore();
});

it('does not render the floating canvas control panel when the shell owns viewport controls', () => {
  renderStage({ viewportController: createExternalViewportController() });

  expect(container?.querySelector('[data-ui="scenario.canvas.floating-controls"]')).toBeNull();
  expect(container?.querySelector('[data-ui="scenario.canvas.controls"]')).toBeNull();
});

it('reserves external floating chrome insets around the scaled slide', () => {
  renderStage({
    viewportController: createExternalViewportController({
      scale: 0.5,
      viewportInsets: { bottom: 160, left: 320, right: 384, top: 96 },
    }),
  });

  const scaledFrame = container?.querySelector<HTMLElement>(
    '[data-ui="scenario.canvas.scaled-frame"]'
  );
  const viewportGrid = scaledFrame?.parentElement;

  expect(viewportGrid?.style.paddingLeft).toBe('320px');
  expect(viewportGrid?.style.paddingRight).toBe('384px');
  expect(viewportGrid?.style.paddingTop).toBe('96px');
  expect(viewportGrid?.style.paddingBottom).toBe('160px');
  expect(viewportGrid?.style.minWidth).toBe('1344px');
  expect(viewportGrid?.style.minHeight).toBe('616px');
});

it('keeps grid visibility, magnet, and grid snapping as separate canvas controls', () => {
  const { onUpdateElement } = renderStage();
  clickByLabel(translate('scenario.editor.toggleGrid'));
  clickByLabel(translate('scenario.editor.toggleMagnet'));
  clickByLabel(translate('scenario.editor.toggleSnapToGrid'));

  act(() => {
    getElementOverlay().dispatchEvent(pointerEvent('pointerdown', 10, 10));
  });
  act(() => {
    const stage = container?.querySelector<HTMLDivElement>('[data-ui="scenario.canvas.stage"]');
    stage?.dispatchEvent(pointerEvent('pointermove', 34, 34));
    stage?.dispatchEvent(pointerEvent('pointerup', 34, 34));
  });

  expect(container?.querySelector('[data-ui="scenario.canvas.grid"]')).toBeNull();
  expect(onUpdateElement).toHaveBeenCalledWith('text-1', {
    frame: expect.objectContaining({ x: 124, y: 144 }),
  });
});

it('toggles the canvas navigator from the viewport controls', () => {
  renderStage();

  expect(container?.querySelector('[data-ui="scenario.canvas.navigator"]')).toBeNull();
  clickByLabel(translate('scenario.editor.toggleNavigator'));

  expect(container?.querySelector('[data-ui="scenario.canvas.navigator"]')).not.toBeNull();
  expect(
    container?.querySelector('[data-ui="scenario.canvas.stage"]')?.className.includes('mx-auto')
  ).toBe(false);
});

function getElementOverlay(): HTMLButtonElement {
  const overlay = container?.querySelector<HTMLButtonElement>(
    '[data-ui="scenario.canvas.element-overlay"]'
  );
  if (!overlay) {
    throw new Error('Expected canvas element overlay');
  }

  return overlay;
}

function clickByLabel(label: string) {
  act(() => {
    container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
  });
}

function pointerEvent(type: string, clientX: number, clientY: number) {
  return new PointerEvent(type, { bubbles: true, clientX, clientY });
}

function mockCanvasViewportRect() {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    bottom: 600,
    height: 600,
    left: 0,
    right: 800,
    toJSON: () => ({}),
    top: 0,
    width: 800,
    x: 0,
    y: 0,
  });
}
