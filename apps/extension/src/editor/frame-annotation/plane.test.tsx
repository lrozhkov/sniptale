// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { EditorFrameAnnotationPlaneController } from './types';

const interactionMocks = vi.hoisted(() => ({
  pointerDown: vi.fn(),
  pointerMove: vi.fn(),
  projection: vi.fn(),
  projected: [] as Array<{ object: Record<string, unknown>; snapshot: Record<string, unknown> }>,
}));

vi.mock('./interaction-controller', () => ({
  MIN_FRAME_SIZE: 8,
  useFrameAnnotationInteraction: () => ({
    objectActions: {},
    planeEvents: interactionMocks,
    projection: {
      distortionScale: 0,
      effectiveSelectedId: 'locked-frame',
      focusFrames: [],
      focusBlurAmount: 0,
      focusOpacity: 0,
      projected: interactionMocks.projected,
      scale: 2,
    },
  }),
}));

vi.mock('./projection', () => ({
  FrameProjection: (props: { interactive: boolean; selected: boolean }) => {
    interactionMocks.projection(props);
    return null;
  },
}));

import { EditorFrameAnnotationPlane } from './plane';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  interactionMocks.pointerDown.mockReset();
  interactionMocks.pointerMove.mockReset();
  interactionMocks.projected.length = 0;
  interactionMocks.projection.mockReset();
});

it('keeps locked frame annotations outside pointer hit-testing', () => {
  interactionMocks.projected.push({
    object: { sniptaleLocked: true },
    snapshot: { id: 'locked-frame' },
  });
  const host = document.createElement('div');
  const canvasRef = createRef<HTMLCanvasElement>();
  canvasRef.current = document.createElement('canvas');
  document.body.append(host);
  const root = createRoot(host);

  act(() =>
    root.render(
      <EditorFrameAnnotationPlane
        activeTool="select"
        canvasRef={canvasRef}
        controller={createPlaneController()}
        layers={[]}
      />
    )
  );

  expect(interactionMocks.projection).toHaveBeenCalledWith(
    expect.objectContaining({ interactive: false, selected: true })
  );
  act(() => root.unmount());
});

it('aligns the DOM scene to the canvas origin and excludes floating controls from creation', async () => {
  const canvas = document.createElement('canvas');
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const canvasRef = createRef<HTMLCanvasElement>();
  canvasRef.current = canvas;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this === canvas) return createRect({ left: 100, top: 150, width: 800, height: 600 });
      if (this.dataset['ui'] === 'editor.frame-annotation-plane')
        return createRect({ left: 20, top: 30, width: 1000, height: 800 });
      return createRect({ left: 0, top: 0, width: 0, height: 0 });
    }
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  act(() =>
    root.render(
      <EditorFrameAnnotationPlane
        activeTool="frame-annotation"
        canvasRef={canvasRef}
        controller={createPlaneController()}
        layers={[]}
      />
    )
  );

  await vi.waitFor(() => {
    expect(
      host.querySelector<HTMLElement>('[data-ui="editor.frame-annotation-scene"]')?.style
    ).toMatchObject({ left: '80px', top: '120px', transform: 'scale(2)' });
  });

  const plane = host.querySelector<HTMLElement>('[data-ui="editor.frame-annotation-plane"]')!;
  const controls = document.body.querySelector<HTMLElement>(
    '[data-ui="editor.frame-annotation-controls-root"]'
  )!;
  const menuButton = document.createElement('button');
  menuButton.style.pointerEvents = 'auto';
  controls.append(menuButton);
  act(() => menuButton.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(interactionMocks.pointerDown).not.toHaveBeenCalled();
  const callout = document.createElement('div');
  callout.className = 'sniptale-callout';
  host.querySelector('[data-ui="editor.frame-annotation-scene"]')?.append(callout);
  act(() => callout.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(interactionMocks.pointerDown).not.toHaveBeenCalled();
  act(() => plane.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(interactionMocks.pointerDown).toHaveBeenCalledOnce();

  act(() => root.unmount());
});

function createPlaneController(): EditorFrameAnnotationPlaneController {
  return {
    canvas: null,
    canvasDocumentSize: { width: 400, height: 300 },
    commitHistory: vi.fn(),
    prepareObject: vi.fn(),
    syncRuntimeState: vi.fn(),
  };
}

function createRect(input: { left: number; top: number; width: number; height: number }): DOMRect {
  return {
    ...input,
    x: input.left,
    y: input.top,
    right: input.left + input.width,
    bottom: input.top + input.height,
    toJSON: () => ({}),
  } as DOMRect;
}
