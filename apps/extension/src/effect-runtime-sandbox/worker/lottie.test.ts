import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  validateAnimationTemplate,
  parseAnimationTemplateSource,
} from '@sniptale/runtime-contracts/animation-template';
import { createLottieFrameRenderer } from './lottie';

type Player = {
  data: Record<string, unknown>;
  frame: number;
  assetResolver: (path: string) => Uint8Array | null;
  destroyed: boolean;
  setFrame: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  setTransform: ReturnType<typeof vi.fn>;
  setViewport: ReturnType<typeof vi.fn>;
  emit(type: string): void;
};
const state = vi.hoisted(() => ({
  players: [] as Player[],
  pendingLoad: false,
  fontRegistration: vi.fn(async (_name: string, _bytes: Uint8Array) => true),
  constructed: null as (() => void) | null,
}));
vi.mock('@lottiefiles/dotlottie-web/dotlottie-player.wasm?url&inline', () => ({
  default: 'data:application/wasm;base64,AGFzbQEAAAA=',
}));
vi.mock('@lottiefiles/dotlottie-web', () => ({
  DotLottie: class {
    static setWasmUrl = vi.fn();
    static preload = vi.fn(async () => undefined);
    static registerFont = state.fontRegistration;
    readonly data: Record<string, unknown>;
    isLoaded: boolean;
    destroyed = false;
    frame = -1;
    private readonly listeners = new Map<string, Set<() => void>>();
    resize = vi.fn();
    setViewport = vi.fn(() => true);
    setTransform = vi.fn(() => true);
    setFrame = vi.fn((frame: number) => {
      this.frame = frame;
    });
    readonly assetResolver: (path: string) => Uint8Array | null;
    constructor(options: {
      data: Record<string, unknown>;
      assetResolver: (path: string) => Uint8Array | null;
    }) {
      this.assetResolver = options.assetResolver;
      this.data = structuredClone(options.data);
      this.isLoaded = !state.pendingLoad;
      state.players.push(this);
      state.constructed?.();
    }
    emit(type: string) {
      if (type === 'load') this.isLoaded = true;
      for (const listener of this.listeners.get(type) ?? []) listener();
    }
    addEventListener(type: string, listener: () => void) {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }
    removeEventListener(type: string, listener: () => void) {
      this.listeners.get(type)?.delete(listener);
    }
    destroy() {
      this.destroyed = true;
    }
  },
}));

const transfer = vi.fn();
const capture = vi.fn(async (canvas: { width: number; height: number }) => ({
  width: canvas.width,
  height: canvas.height,
  close: vi.fn(),
}));
beforeEach(() => {
  state.players = [];
  state.pendingLoad = false;
  state.constructed = null;
  state.fontRegistration.mockClear();
  transfer.mockClear();
  capture.mockClear();
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        public width: number,
        public height: number
      ) {}
      transferToImageBitmap = transfer;
    }
  );
  vi.stubGlobal('createImageBitmap', capture);
});
afterEach(() => vi.unstubAllGlobals());
const property = (k: unknown, sid?: string) => ({ a: 0, k, ...(sid ? { sid } : {}) });
function template() {
  const result = validateAnimationTemplate({
    format: 'sniptale-animation',
    version: 1,
    id: 'runtime-proof',
    label: { en: 'Runtime proof' },
    resources: [],
    controls: [
      { id: 'x', kind: 'number', defaultValue: 160, min: -1000, max: 1000 },
      { id: 'y', kind: 'number', defaultValue: 90, min: -1000, max: 1000 },
      { id: 'opacity', kind: 'number', defaultValue: 100, min: 0, max: 100 },
      { id: 'color', kind: 'color', defaultValue: '#ff6600' },
    ],
    bindings: [
      { kind: 'vector', slot: 'position', xControl: 'x', yControl: 'y' },
      { kind: 'scalar', slot: 'opacity', control: 'opacity' },
      { kind: 'color', slot: 'accent', control: 'color' },
    ],
    objectLayout: {
      handles: [{ id: 'tip', label: { en: 'Tip' }, xControl: 'x', yControl: 'y', padding: 16 }],
    },
    animation: {
      v: '5.12.2',
      fr: 30,
      ip: 30,
      op: 90,
      w: 320,
      h: 180,
      ddd: 0,
      assets: [],
      slots: {
        position: { p: property([160, 90]) },
        opacity: { p: property(100) },
        accent: { p: property([1, 0.4, 0, 1]) },
      },
      layers: [
        {
          ty: 4,
          ind: 1,
          ddd: 0,
          sr: 1,
          ip: 30,
          op: 90,
          st: 0,
          bm: 0,
          ao: 0,
          ks: {
            p: property([160, 90], 'position'),
            a: property([0, 0]),
            s: property([100, 100]),
            r: property(0),
            o: property(100, 'opacity'),
          },
          shapes: [
            { ty: 'rc', d: 1, p: property([0, 0]), s: property([100, 50]), r: property(0) },
            { ty: 'fl', c: property([1, 0.4, 0, 1], 'accent'), o: property(100), r: 1, bm: 0 },
          ],
        },
      ],
    },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.template;
}
const values = { x: 160, y: 90, opacity: 100, color: '#ff6600' };
const request = (overrides = {}) => ({
  time: 0,
  width: 320,
  height: 180,
  values,
  signal: new AbortController().signal,
  ...overrides,
});

it('materializes standard named layer slots once per parameter change without mutating accepted sources', async () => {
  const source = template(),
    before = JSON.stringify(source),
    renderer = await createLottieFrameRenderer(source);
  const first = await renderer.render(request({ values: { ...values, x: -50 } }));
  first.close();
  expect(state.players).toHaveLength(1);
  expect(state.players[0]!.data).toMatchObject({
    w: 422,
    h: 180,
    layers: [
      expect.objectContaining({ ks: expect.objectContaining({ p: { a: 0, k: [-50, 90] } }) }),
      expect.objectContaining({
        ty: 3,
        ks: expect.objectContaining({ p: { a: 0, k: [102, expect.closeTo(0, 9), 0] } }),
      }),
    ],
  });
  (await renderer.render(request({ time: 0.5, values: { ...values, x: -50 } }))).close();
  expect(state.players).toHaveLength(1);
  (await renderer.render(request())).close();
  expect(state.players).toHaveLength(2);
  expect(state.players[0]!.destroyed).toBe(true);
  expect(JSON.stringify(source)).toBe(before);
  renderer.dispose();
});

it('uses relative ip, clamps EOF, and retains held images across physical preview sizes', async () => {
  const renderer = await createLottieFrameRenderer(template());
  (await renderer.render(request())).close();
  expect(state.players[0]!.frame).toBe(0);
  (await renderer.render(request({ time: 999 }))).close();
  expect(state.players[0]!.frame).toBe(59);
  (await renderer.render(request({ width: 160, height: 90 }))).close();
  (await renderer.render(request())).close();
  expect(state.players).toHaveLength(1);
  expect(state.players[0]!.resize).toHaveBeenCalledTimes(2);
  expect(capture).toHaveBeenCalledTimes(4);
  expect(transfer).not.toHaveBeenCalled();
  renderer.dispose();
});

it('converts color alpha to paint opacity while retaining independent layer opacity', async () => {
  const renderer = await createLottieFrameRenderer(template());
  (
    await renderer.render(request({ values: { ...values, opacity: 50, color: '#ff660080' } }))
  ).close();
  expect(state.players[0]!.data).toMatchObject({
    layers: [
      expect.objectContaining({
        ks: expect.objectContaining({ o: { a: 0, k: 50 } }),
        shapes: [expect.anything(), expect.objectContaining({ o: { a: 0, k: (100 * 128) / 255 } })],
      }),
    ],
  });
  renderer.dispose();
});

it('closes a captured bitmap if its request becomes obsolete before publication', async () => {
  const renderer = await createLottieFrameRenderer(template());
  const controller = new AbortController();
  const close = vi.fn();
  capture.mockImplementationOnce(async (canvas) => {
    controller.abort();
    return { width: canvas.width, height: canvas.height, close };
  });
  await expect(renderer.render(request({ signal: controller.signal }))).rejects.toThrow();
  expect(close).toHaveBeenCalledOnce();
  renderer.dispose();
});

it('destroys an in-flight model on disposal and refuses its late completion', async () => {
  const renderer = await createLottieFrameRenderer(template());
  state.pendingLoad = true;
  const constructed = new Promise<void>((resolve) => {
    state.constructed = resolve;
  });
  const pending = renderer.render(request());
  await constructed;
  renderer.dispose();
  await expect(pending).rejects.toThrow('disposed');
  state.players[0]!.emit('load');
  expect(state.players[0]!.destroyed).toBe(true);
  expect(capture).not.toHaveBeenCalled();
});

it('does not retain a failed load and permits a fresh render attempt', async () => {
  const renderer = await createLottieFrameRenderer(template());
  state.pendingLoad = true;
  const constructed = new Promise<void>((resolve) => {
    state.constructed = resolve;
  });
  const pending = renderer.render(request());
  await constructed;
  state.players[0]!.emit('loadError');
  await expect(pending).rejects.toThrow('load failed');
  expect(state.players[0]!.destroyed).toBe(true);
  state.pendingLoad = false;
  (await renderer.render(request())).close();
  expect(state.players).toHaveLength(2);
  renderer.dispose();
});

it('cancels a pending load without waiting for its deadline or first frame', async () => {
  const renderer = await createLottieFrameRenderer(template());
  const controller = new AbortController();
  state.pendingLoad = true;
  const constructed = new Promise<void>((resolve) => {
    state.constructed = resolve;
  });
  const pending = renderer.render(request({ signal: controller.signal }));
  await constructed;
  controller.abort();
  await expect(pending).rejects.toThrow();
  expect(state.players[0]!.destroyed).toBe(true);
  expect(capture).not.toHaveBeenCalled();
  renderer.dispose();
});

it('registers local font bytes for each new core while retaining bounded browser font metrics', async () => {
  const fontAdds = vi.fn();
  vi.stubGlobal('self', { fonts: { add: fontAdds } });
  const fontLoads = vi.fn();
  vi.stubGlobal(
    'FontFace',
    class {
      load() {
        fontLoads();
        return Promise.resolve(this);
      }
    }
  );
  const source = template();
  const bytes = Uint8Array.of(0, 1, 0, 0, 1, 2, 3, 4);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  source.resources = [
    {
      path: 'fonts/test.ttf',
      fontFamily: 'Test',
      mimeType: 'font/ttf',
      byteLength: bytes.length,
      base64: 'AAEAAAECAwQ=',
      sha256: digest,
    },
  ];
  const renderer = await createLottieFrameRenderer(source);
  (await renderer.render(request())).close();
  (await renderer.render(request({ time: 0.5 }))).close();
  expect(state.fontRegistration).toHaveBeenCalledTimes(1);
  (await renderer.render(request({ values: { ...values, opacity: 50 } }))).close();
  expect(state.fontRegistration).toHaveBeenCalledTimes(2);
  renderer.dispose();
  const next = await createLottieFrameRenderer(source);
  (await next.render(request())).close();
  expect(state.fontRegistration).toHaveBeenCalledTimes(3);
  expect(state.fontRegistration).toHaveBeenLastCalledWith(`Sniptale_${digest}`, bytes);
  expect(fontLoads).toHaveBeenCalledOnce();
  expect(fontAdds).toHaveBeenCalledOnce();
  next.dispose();
});

it('resolves only declared image bytes for package and core-root paths', async () => {
  const source = template();
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAO0lEQVR4AezXwQkAMAgDwOIS3a2Ddj0d' +
    'wacgF8g/3C9x/8vJxhmOAQQIECBAgAABAgQIECBAYL9Ad74LAAD//+4IQ00AAAAGSURBVAMAhCtFARpI' +
    'aNUAAAAASUVORK5CYII=';
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  source.resources = [
    {
      path: 'images/mark.png',
      mimeType: 'image/png',
      byteLength: bytes.length,
      base64,
      sha256: 'd5c4e9617e107979987133b9ec095a4c02b140f208d21069caae4d6a4da8a2b2',
    },
  ];
  const renderer = await createLottieFrameRenderer(source);
  (await renderer.render(request())).close();
  const resolver = state.players.at(-1)!.assetResolver;
  expect(resolver('images/mark.png')).toEqual(bytes);
  expect(resolver('/images/mark.png')).toEqual(bytes);
  for (const path of [
    'https://example.com/images/mark.png',
    '//images/mark.png',
    '/images/../images/mark.png',
    '/images/missing.png',
    '/images%2fmark.png',
  ])
    expect(resolver(path)).toBeNull();
  renderer.dispose();
  expect(resolver('/images/mark.png')).toBeNull();
});

it.each(['callout', 'arrow'])(
  'materializes the shipped %s geometry and local text font in the Worker',
  async (name) => {
    const accepted = parseAnimationTemplateSource(
      readFileSync(
        name === 'callout'
          ? 'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json'
          : `apps/extension/public/video-effects/animations/${name}.sniptale-animation.json`,
        'utf8'
      )
    );
    if (!accepted.ok) throw new Error('Invalid shipped animation');
    const source = accepted.template;
    const measureText = vi.fn((text: string) => ({ width: Array.from(text).length * 8 }));
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor(
          public width: number,
          public height: number
        ) {}
        getContext() {
          return { font: '', measureText };
        }
      }
    );
    const add = vi.fn();
    vi.stubGlobal('self', { fonts: { add } });
    vi.stubGlobal(
      'FontFace',
      class {
        async load() {
          return this;
        }
      }
    );
    const renderer = await createLottieFrameRenderer(source);
    const controls = Object.fromEntries(
      source.controls.map((control) => [control.id, control.defaultValue])
    );
    if (name === 'callout') controls['title'] = 'Local text';
    const bitmap = await renderer.render(request({ width: 640, height: 360, values: controls }));
    expect(bitmap).toMatchObject({ width: 640, height: 360 });
    const player = state.players.at(-1)!;
    expect(player.frame).toBe(0);
    if (name === 'callout') {
      expect(measureText).toHaveBeenCalled();
      expect(JSON.stringify(player.data)).toContain('Local text');
      expect(JSON.stringify(player.data)).toContain('Sniptale_');
      expect(state.fontRegistration).toHaveBeenCalled();
    } else {
      const before = state.players.length;
      controls['endX'] = 200;
      (await renderer.render(request({ values: controls }))).close();
      expect(state.players.length).toBe(before + 1);
      expect(player.destroyed).toBe(true);
    }
    bitmap.close();
    renderer.dispose();
    expect(state.players.at(-1)!.destroyed).toBe(true);
  }
);

it('does not redraw the previous frame by resetting an unchanged viewport transform', async () => {
  const renderer = await createLottieFrameRenderer(template());
  (await renderer.render(request())).close();
  const player = state.players.at(-1)!;
  (await renderer.render(request({ time: 0.5 }))).close();
  expect(player.setTransform).toHaveBeenCalledTimes(1);
  expect(player.setViewport).toHaveBeenCalledTimes(1);
  expect(player.setFrame).toHaveBeenCalledTimes(2);
  (await renderer.render(request({ time: 0.6, width: 640, height: 360 }))).close();
  expect(player.setTransform).toHaveBeenCalledTimes(2);
  expect(player.setViewport).toHaveBeenCalledTimes(2);
  (await renderer.render(request({ time: 0.7, values: { ...values, opacity: 50 } }))).close();
  const rebuilt = state.players.at(-1)!;
  expect(rebuilt).not.toBe(player);
  expect(rebuilt.setTransform).toHaveBeenCalledOnce();
  renderer.dispose();
});
