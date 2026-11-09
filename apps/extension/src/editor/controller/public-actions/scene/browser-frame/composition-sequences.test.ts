// @vitest-environment jsdom
import { replaceEditorDrawingObjectWithCanonicalGeometry } from '../../../../drawing/object/canonicalize';
import { syncSourceStateFromObject } from '../../../document/source';
import { runEditorCropSelection } from '../../../crop-workflow/apply/scene';
import { resizeEditorCanvasScene, resizeEditorSourceScene } from '../resize/dimensions';
import { createEditorDrawingFabricObject } from '../../../../drawing/object/vector';
import { readEditorDrawingObject } from '../../../../drawing/object/metadata';
import { windowHeaderGeometry } from '@sniptale/runtime-contracts/window-header';
import { resolveEditorWindowHeader } from '../../../../../features/editor/document/constants';
import { Canvas, Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../../features/editor/document/constants';
import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../../../features/editor/document/types';
import type { SourceState } from '../../../../document/model/source-state';
import { relayoutEditorScene } from '../../../document/scene';
import { applyEditorBrowserFrameSettings, removeEditorBrowserFrameSettings } from './mutation';
import { applyEditorFrameSceneSettings } from '../resize/frame';

vi.mock('../../../viewport', () => ({ applyEditorViewportZoom: vi.fn() }));
vi.mock('../../../../objects/browser-frame', () => ({
  createBrowserFrameLayerObject: vi.fn(async (o) => {
    const r = new Rect({
      left: o.left,
      top: o.top,
      width: o.width,
      height: windowHeaderGeometry(resolveEditorWindowHeader(o.browserFrame), {
        width: o.width,
        height: o.sourceHeight,
      }).height,
      strokeWidth: 0,
    });
    r.sniptaleRole = 'annotation';
    r.sniptaleType = 'browser-frame';
    return r;
  }),
}));
function fixture() {
  const canvas = new Canvas(document.createElement('canvas'), { renderOnAddRemove: false });
  const image = new Rect({ left: 0, top: 0, width: 800, height: 600, strokeWidth: 0 });
  image.sniptaleRole = 'source';
  image.sniptaleType = 'source-image';
  const mark = new Rect({ left: 100, top: 150, width: 80, height: 40, strokeWidth: 0 });
  mark.sniptaleRole = 'annotation';
  canvas.add(image, mark);
  let source: SourceState = {
    id: 's',
    dataUrl: '',
    name: null,
    intrinsicWidth: 800,
    intrinsicHeight: 600,
    displayWidth: 800,
    displayHeight: 600,
    left: 0,
    top: 0,
    locked: false,
    visible: true,
  };
  let size = { width: 800, height: 600 };
  let frame: EditorFrameSettings = {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
  };
  let header: BrowserFrameState = { ...DEFAULT_BROWSER_FRAME_STATE };
  const store = {
    getFrame: () => frame,
    getBrowserFrame: () => header,
    updateFrame: (n: EditorFrameSettings) => {
      frame = n;
    },
    setBrowserFrame: (n: BrowserFrameState) => {
      header = n;
    },
  };
  const relayout = (f: EditorFrameSettings, b: BrowserFrameState, o = {}) => {
    const r = relayoutEditorScene(canvas, source, size, f, b, o)!;
    source = r.source;
    size = r.canvasSize;
  };
  const common = () => ({
    canvas,
    source,
    store,
    canvasDocumentSize: size,
    ensureBrowserFrameOnTop() {},
    commitHistory() {},
    syncRuntimeState() {},
  });
  return {
    canvas,
    frame: () => frame,
    manual: (width: number, height: number) => {
      image.set({ scaleX: width / 800, scaleY: height / 600 });
      source = syncSourceStateFromObject(source, image)!;
    },
    crop: (width: number, height: number) =>
      runEditorCropSelection({
        canvas,
        source,
        frame,
        browserFrame: header,
        crop: { left: 0, top: 0, width, height },
        setCanvasDocumentSize: (next) => {
          size = next;
        },
        setSource: (next) => {
          source = next!;
        },
        syncViewportTransform() {},
        rebuildFrameDecorations: async () => {},
      }),
    legacy: (base: NonNullable<BrowserFrameState['compositionBase']>) => {
      delete source.compositionBase;
      header = { ...header, compositionBase: base };
    },
    resizeCanvas: (width: number, height: number) =>
      resizeEditorCanvasScene({
        ...common(),
        width,
        height,
        zoomLevel: 1,
        getCanvasDocumentSize: () => size,
        relayoutScene: relayout,
        setCanvasDocumentSize: (next) => {
          size = next;
        },
        ensureReachableObjects: () => false,
        rebuildFrameDecorations: async () => {},
      }),
    resize: (width: number, height: number) =>
      resizeEditorSourceScene({
        ...common(),
        width,
        height,
        zoomLevel: 1,
        getCanvasDocumentSize: () => size,
        relayoutScene: relayout,
        ensureReachableObjects: () => false,
        rebuildFrameDecorations: async () => {},
      }),
    header: () => header,
    state: () => ({
      size: { ...size },
      source: [source.left, source.top, source.displayWidth, source.displayHeight],
      mark: [mark.left, mark.top, mark.getScaledWidth(), mark.getScaledHeight()],
      header: canvas
        .getObjects()
        .filter((o) => o.sniptaleType === 'browser-frame')
        .map((o) => [o.left, o.top, o.getScaledWidth(), o.getScaledHeight()]),
    }),
    bg: async (patch: Partial<EditorFrameSettings>, preview = false) =>
      applyEditorFrameSceneSettings({
        ...common(),
        frame: { ...frame, ...patch },
        preview,
        zoomLevel: 1,
        getCanvasDocumentSize: () => size,
        relayoutScene: relayout,
        ensureReachableObjects: () => false,
        rebuildFrameDecorations: async () => {},
      }),
    head: async (fit: boolean) =>
      applyEditorBrowserFrameSettings({
        ...common(),
        browserFrame: {
          ...header,
          enabled: true,
          canvasMode: fit ? 'keep-size' : 'resize',
          contentMode: fit ? 'fit-content' : 'push-down',
        },
        relayoutScene: (h, o) => relayout(frame, h, o),
      }),
    off: async () =>
      removeEditorBrowserFrameSettings({
        ...common(),
        relayoutScene: (h, o) => relayout(frame, h, o),
      }),
  };
}

const padding = (v: number) => ({
  paddingTop: v,
  paddingBottom: v,
  paddingLeft: v,
  paddingRight: v,
});
function sameScene(
  actual: ReturnType<ReturnType<typeof fixture>['state']>,
  expected: typeof actual
) {
  expect(actual.size).toEqual(expected.size);
  for (const key of ['source', 'mark'] as const)
    actual[key].forEach((v, i) => expect(v).toBeCloseTo(expected[key][i]!, 3));
}
function attached(f: ReturnType<typeof fixture>) {
  const s = f.state();
  if (s.header.length) {
    const h = s.header[0]!;
    expect(h[0]).toBeCloseTo(s.source[0]!, 3);
    expect(h[1]! + h[3]!).toBeCloseTo(s.source[1]!, 3);
    expect(h[2]).toBeCloseTo(s.source[2]!, 3);
  }
  expect((s.mark[0]! - s.source[0]!) / s.source[2]!).toBeCloseTo(100 / 800, 6);
  expect(s.mark[2]! / s.source[2]!).toBeCloseTo(80 / 800, 6);
}
it.each(['off', 'expand', 'fit'] as const)(
  'restores common baseline after fit and padding round trips: header %s',
  async (h) => {
    const f = fixture();
    try {
      if (h !== 'off') await f.head(h === 'fit');
      const initial = f.state();
      for (let i = 0; i < 3; i++) {
        await f.bg({ layoutMode: 'fit-image', ...padding(60) });
        attached(f);
        await f.bg({ layoutMode: 'expand-canvas', ...padding(0) });
        attached(f);
        sameScene(f.state(), initial);
      }
    } finally {
      await f.canvas.dispose();
    }
  }
);
it.each(['expand-canvas', 'fit-image'] as const)(
  'keeps changed padding after removing header: %s',
  async (layoutMode) => {
    const f = fixture();
    try {
      await f.bg({ layoutMode });
      await f.head(false);
      await f.bg(padding(60));
      attached(f);
      await f.off();
      const without = f.state();
      const reference = fixture();
      try {
        await reference.bg({ layoutMode, ...padding(60) });
        sameScene(without, reference.state());
      } finally {
        await reference.canvas.dispose();
      }
    } finally {
      await f.canvas.dispose();
    }
  }
);
it('restores preview geometry without pixel drift and retains header attachment', async () => {
  const f = fixture();
  try {
    await f.head(true);
    await f.bg(padding(60));
    const initial = f.state();
    for (let i = 0; i < 4; i++) {
      await f.bg(padding(100), true);
      attached(f);
      await f.bg(f.frame(), true);
      attached(f);
      sameScene(f.state(), initial);
    }
  } finally {
    await f.canvas.dispose();
  }
});
it.each([false, true])(
  'keeps final geometry independent of background/header order (header fit %s)',
  async (fit) => {
    const a = fixture(),
      b = fixture();
    try {
      await a.bg({ layoutMode: 'fit-image', ...padding(60) });
      await a.head(fit);
      await b.head(fit);
      await b.bg({ layoutMode: 'fit-image', ...padding(60) });
      attached(a);
      attached(b);
      sameScene(a.state(), b.state());
    } finally {
      await a.canvas.dispose();
      await b.canvas.dispose();
    }
  }
);

it('uses the same text geometry before and after canonical history restoration', async () => {
  const f = fixture();
  try {
    const text = createEditorDrawingFabricObject(
      {
        kind: 'text',
        id: 'label',
        bounds: { x: 100, y: 150, width: 200, height: 34 },
        fontSize: 24,
        color: '#000',
        backgroundColor: null,
        text: 'Mixed composition',
      },
      1
    );
    f.canvas.add(text);
    await f.bg({ layoutMode: 'fit-image', ...padding(60) });
    const drawing = readEditorDrawingObject(text)!;
    if (drawing.kind !== 'text') throw new Error('Expected text');
    const restored = createEditorDrawingFabricObject(drawing, 1);
    expect(restored.getScaledHeight()).toBeCloseTo(text.getScaledHeight(), 3);
    expect(restored.getScaledWidth()).toBeCloseTo(text.getScaledWidth(), 3);
  } finally {
    await f.canvas.dispose();
  }
});

it.each([0, 60])(
  'opens a legacy header baseline and retains current padding %s on Off',
  async (value) => {
    const f = fixture();
    try {
      await f.bg(padding(value));
      const before = f.state();
      await f.head(true);
      f.legacy({
        sourceWidth: 800,
        sourceHeight: 600,
        canvasWidth: before.size.width,
        canvasHeight: before.size.height,
      });
      await f.off();
      sameScene(f.state(), before);
    } finally {
      await f.canvas.dispose();
    }
  }
);
it('uses an explicit source resize as the baseline for subsequent composition switches', async () => {
  const f = fixture();
  try {
    await f.head(false);
    f.resize(1000, 750);
    const resized = f.state();
    await f.bg({ layoutMode: 'fit-image', ...padding(60) });
    attached(f);
    await f.bg({ layoutMode: 'expand-canvas', ...padding(0) });
    attached(f);
    sameScene(f.state(), resized);
  } finally {
    await f.canvas.dispose();
  }
});

it('keeps a cropped canvas when the fitted header is rebuilt', async () => {
  const f = fixture();
  try {
    await f.head(true);
    await f.crop(400, 300);
    await f.head(true);
    expect(f.state().size).toEqual({ width: 400, height: 300 });
    attached(f);
  } finally {
    await f.canvas.dispose();
  }
});
it('keeps the explicitly resized unlocked source when adding a header', async () => {
  const f = fixture();
  try {
    await f.bg(padding(60));
    f.manual(400, 300);
    await f.head(false);
    expect(f.state().source.slice(2)).toEqual([400, 300]);
  } finally {
    await f.canvas.dispose();
  }
});

it('restores text width after a small-canvas fit without accumulating the editing minimum', async () => {
  const f = fixture();
  try {
    let text = createEditorDrawingFabricObject(
      {
        kind: 'text',
        id: 'small-label',
        bounds: { x: 100, y: 150, width: 120, height: 34 },
        fontSize: 18,
        color: '#000',
        backgroundColor: null,
        text: 'Label',
      },
      1
    );
    f.canvas.add(text);
    const initial = text.getScaledWidth();
    await f.crop(200, 150);
    await f.head(true);
    const scaledWidth = text.getScaledWidth();
    text = replaceEditorDrawingObjectWithCanonicalGeometry({
      canvas: f.canvas,
      object: text,
      source: null,
      prepareObject() {},
    });
    expect(text.getScaledWidth()).toBeCloseTo(scaledWidth, 3);
    await f.head(false);
    expect(text.getScaledWidth()).toBeCloseTo(initial, 3);
  } finally {
    await f.canvas.dispose();
  }
});

it.each([1, 100, 120, 400])(
  'retains an explicit %s px canvas smaller than padding on a fitted-header rebuild',
  async (size) => {
    for (const edit of ['crop', 'resize'] as const) {
      const f = fixture();
      try {
        await f.bg(padding(60));
        await f.head(true);
        if (edit === 'crop') await f.crop(size, size);
        else f.resizeCanvas(size, size);
        await f.head(true);
        expect(f.state().size).toEqual({ width: size, height: size });
      } finally {
        await f.canvas.dispose();
      }
    }
  }
);

it.each(['side', 'area'] as const)(
  'refuses a composed canvas beyond the %s budget before changing the scene',
  async (kind) => {
    const f = fixture();
    try {
      await f.head(true);
      f.legacy({
        sourceWidth: 800,
        sourceHeight: 600,
        canvasWidth: 32768,
        canvasHeight: kind === 'area' ? 3051 : 1000,
      });
      const before = f.state();
      await expect(kind === 'area' ? f.head(false) : f.bg(padding(60))).rejects.toThrow(
        'canvas size limits'
      );
      sameScene(f.state(), before);
    } finally {
      await f.canvas.dispose();
    }
  }
);
