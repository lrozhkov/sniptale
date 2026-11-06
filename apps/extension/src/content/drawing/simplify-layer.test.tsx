// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createDefaultSimplifySettings } from '../../features/simplify/settings';
import { createDrawingSession } from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { DrawingSurface } from './surface';
import { DrawingSimplifyLayer } from './simplify-layer';
import { DrawingVisualLayers } from './surface-visual-layers';

it('keeps native raster nodes and URLs out of the open UI tree', () => {
  const outer = document.createElement('div');
  document.body.append(outer);
  const open = outer.attachShadow({ mode: 'open' });
  const target = document.createElement('div');
  open.append(target);
  const root = createRoot(target);
  const dataUrl = 'data:image/png;base64,private-result';
  act(() =>
    root.render(
      <DrawingSimplifyLayer
        object={{
          id: 'private',
          kind: 'simplify',
          bounds: { x: 20, y: 30, width: 100, height: 40 },
          settings: createDefaultSimplifySettings(),
          result: { dataUrl, width: 100, height: 40 },
        }}
        projection={{ x: 5, y: 10 }}
      />
    )
  );
  const host = open.querySelector<HTMLElement>('[data-ui="content.drawing.simplify-private"]')!;
  expect(host.shadowRoot).toBeNull();
  expect(open.querySelector('img,canvas')).toBeNull();
  expect(open.innerHTML).not.toContain(dataUrl);
  expect(host.style.left).toBe('15px');
  expect(host.style.top).toBe('20px');
  act(() => root.unmount());
  outer.remove();
});

it('clips a private tile to the supported element scroll root', () => {
  const scroll = document.createElement('div');
  scroll.getBoundingClientRect = () => ({
    x: 10,
    y: 20,
    top: 20,
    left: 10,
    right: 210,
    bottom: 120,
    width: 200,
    height: 100,
    toJSON() {},
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <DrawingVisualLayers
        layers={[
          { kind: 'ink', objects: [] },
          {
            kind: 'simplify',
            object: {
              id: 'clipped',
              kind: 'simplify',
              bounds: { x: 0, y: 0, width: 300, height: 200 },
              settings: createDefaultSimplifySettings(),
            },
          },
        ]}
        projection={{ x: 0, y: 0 }}
        root={{ kind: 'element', element: scroll }}
      />
    )
  );
  const layer = host.querySelector<HTMLElement>('[data-ui="content.drawing.visual-layer"]')!;
  expect(layer.style.clipPath).toBe(
    `inset(20px ${Math.max(0, window.innerWidth - 210)}px ${Math.max(0, window.innerHeight - 120)}px 10px)`
  );
  expect(host.querySelector('img,canvas')).toBeNull();
  act(() => root.unmount());
  host.remove();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('removes the previous raster during a disposable mask transform instead of stretching it', () => {
  const images: HTMLImageElement[] = [];
  vi.stubGlobal(
    'Image',
    class {
      constructor() {
        const image = document.createElement('img');
        images.push(image);
        return image;
      }
    }
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const object = {
    id: 'resize-preview',
    kind: 'simplify',
    bounds: { x: 10, y: 20, width: 40, height: 30 },
    settings: createDefaultSimplifySettings(),
  } as const;
  act(() =>
    root.render(
      <DrawingSimplifyLayer
        object={{
          ...object,
          result: { dataUrl: 'data:image/png;base64,result', width: 40, height: 30 },
        }}
        projection={{ x: 0, y: 0 }}
      />
    )
  );
  const image = images[0]!;
  act(() => image.dispatchEvent(new Event('load')));
  const privateRoot = image.parentNode;
  expect(image.isConnected).toBe(true);
  act(() =>
    root.render(
      <DrawingSimplifyLayer
        object={{ ...object, bounds: { ...object.bounds, width: 90 } }}
        projection={{ x: 0, y: 0 }}
      />
    )
  );
  expect(privateRoot?.childNodes).toHaveLength(0);
  expect(image.isConnected).toBe(false);
  const preview = host.querySelector<HTMLElement>('[data-ui="content.drawing.simplify-private"]')!;
  expect(preview.style.backdropFilter).toBe('blur(2px)');
  act(() => root.unmount());
  host.remove();
});

it('uses only a private one-pixel fill while a manual Image glyph is resized', () => {
  const context = document.createElement('canvas').getContext('2d')!;
  const draw = vi.spyOn(context, 'drawImage').mockImplementation(() => undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  const images: HTMLImageElement[] = [];
  vi.stubGlobal(
    'Image',
    class {
      constructor() {
        const image = document.createElement('img');
        images.push(image);
        return image;
      }
    }
  );
  const object = {
    id: 'primitive-preview',
    kind: 'simplify',
    bounds: { x: 10, y: 10, width: 60, height: 60 },
    settings: { ...createDefaultSimplifySettings(), automatic: false, manualKind: 'image' },
    result: { dataUrl: 'data:image/png;base64,result', width: 60, height: 60 },
  } as const;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DrawingSimplifyLayer object={object} projection={{ x: 0, y: 0 }} />));
  const image = images[0]!;
  act(() => image.dispatchEvent(new Event('load')));
  const privateRoot = image.parentNode;
  if (!(privateRoot instanceof ShadowRoot)) throw new Error('Missing private raster root');
  act(() =>
    root.render(
      <DrawingSimplifyLayer
        previewFill
        object={{ ...object, bounds: { ...object.bounds, width: 120 } }}
        projection={{ x: 0, y: 0 }}
      />
    )
  );
  const fill = privateRoot.querySelector('canvas')!;
  expect(fill.width).toBe(1);
  expect(fill.height).toBe(1);
  expect(image.isConnected).toBe(false);
  expect(draw).toHaveBeenCalledWith(image, 0, 0, 1, 1, 0, 0, 1, 1);
  expect(fill.style.width).toBe('100%');
  expect(fill.style.height).toBe('100%');
  expect(host.querySelector('img,canvas')).toBeNull();
  act(() => root.unmount());
  host.remove();
});

it.each([true, false])(
  'retains blur until private pixels load, including manual Image (automatic=%s)',
  (automatic) => {
    const images: HTMLImageElement[] = [];
    vi.stubGlobal(
      'Image',
      class {
        constructor() {
          const image = document.createElement('img');
          images.push(image);
          return image;
        }
      }
    );
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const object = {
      id: 'mask',
      kind: 'simplify' as const,
      bounds: { x: 20, y: 30, width: 100, height: 40 },
      settings: { ...createDefaultSimplifySettings(), automatic, manualKind: 'image' as const },
    };
    act(() => root.render(<DrawingSimplifyLayer object={object} projection={{ x: 0, y: 0 }} />));
    act(() =>
      root.render(
        <DrawingSimplifyLayer
          object={{
            ...object,
            result: { dataUrl: 'data:image/png;base64,private', width: 100, height: 40 },
          }}
          projection={{ x: 0, y: 0 }}
        />
      )
    );
    const mask = host.querySelector<HTMLElement>('[data-ui="content.drawing.simplify-private"]')!;
    try {
      expect(mask.style.backdropFilter).toBe('blur(2px)');
      const image = images[0]!;
      const animate = vi.fn();
      Object.defineProperty(image, 'animate', { value: animate });
      act(() => image.dispatchEvent(new Event('load')));
      expect(image.isConnected).toBe(true);
      expect(mask.style.backdropFilter).toBe('');
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
        expect(animate).toHaveBeenCalledWith([{ filter: 'blur(2px)' }, { filter: 'blur(0px)' }], {
          duration: 150,
        });
      expect(host.querySelector('img')).toBeNull();
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  }
);

it('keeps an uncommitted new Simplify mask visibly blurred while acquisition is pending', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { createContentSimplifyRuntime } = await import('./simplify');
  const { createDefaultSimplifySettings } = await import('../../features/simplify/settings');
  const acquisition = Promise.withResolvers<never>();
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.setActiveTool('simplify');
  const simplify = createContentSimplifyRuntime(session, {
    acquire: () => acquisition.promise,
    send: vi.fn(async () => undefined),
    decode: vi.fn(async () => undefined),
  });
  const controller: ContentDrawingController = {
    session,
    simplify,
    getPalette: () => [],
    applyPalette: vi.fn(),
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
    finalizeInteraction: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
  let work: Promise<void> | undefined;
  act(() => {
    work = simplify.submit(
      {
        id: 'pending-mask',
        kind: 'simplify',
        bounds: { x: 20, y: 30, width: 100, height: 60 },
        settings: createDefaultSimplifySettings(),
      },
      new Event('pointerup')
    );
  });
  try {
    const mask = host.querySelector<HTMLElement>('[data-ui="content.drawing.simplify-private"]');
    expect(mask).not.toBeNull();
    expect(mask?.style.backdropFilter).toBe('blur(2px)');
    expect(session.getSnapshot().document.objects).toHaveLength(0);
  } finally {
    act(() => {
      simplify.dispose();
      root.unmount();
    });
    host.remove();
    acquisition.reject(new Error('Cancelled acquisition'));
    await work;
  }
});
