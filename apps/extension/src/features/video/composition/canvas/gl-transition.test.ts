// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { beforeEach, beforeAll, afterEach, expect, it, vi } from 'vitest';
import { tsImport } from 'tsx/esm/api';
import { resolve } from 'node:path';
import { createGlTransitionSelection, GL_TRANSITIONS } from '../../project/transition/gl-catalog';
import {
  createGlTransitionGpu,
  createGlTransitionCanvas,
  loadLocalGlTransitionAsset,
} from './gl-transition';
import { graphics } from './gpu-preview.test-support';
import {
  validateGpuPreviewFrame,
  omitLeadingGroupCopies,
  gpuPreviewTextureBytes,
  resolveGpuPreviewGroupRasters,
} from './gpu-preview-plan';
import { createGpuPreviewDrawBounds } from './gpu-preview-bounds';
import type { GpuPreviewGroup, GpuPreviewLayer } from './gpu-preview-types';

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0 }) });
});
const assets = new Map<string, string | Uint8Array>();
beforeAll(async () => {
  const module: unknown = await tsImport(
    resolve('apps/extension/build/gl-transitions.ts'),
    import.meta.url
  );
  if (
    module === null ||
    typeof module !== 'object' ||
    !('buildGlTransitionCatalog' in module) ||
    typeof module.buildGlTransitionCatalog !== 'function'
  )
    throw new Error('Missing GL build owner.');
  const result: unknown = await module.buildGlTransitionCatalog();
  if (
    result === null ||
    typeof result !== 'object' ||
    !('assets' in result) ||
    !(result.assets instanceof Map)
  )
    throw new Error('Invalid GL build result.');
  for (const [path, bytes] of result.assets) {
    if (typeof path !== 'string' || (typeof bytes !== 'string' && !(bytes instanceof Uint8Array)))
      throw new Error('Invalid GL build asset.');
    assets.set(path, bytes);
  }
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const load = async (path: string) => {
  const source = assets.get(path);
  if (source === undefined) throw new Error('Missing fixture asset.');
  return typeof source === 'string' ? new TextEncoder().encode(source) : Uint8Array.from(source);
};
function graph() {
  graphics();
  const size = { width: 64, height: 36 };
  const raster = Object.assign(document.createElement('canvas'), size);
  const layer = (): GpuPreviewLayer => ({
    source: raster,
    rect: { x: 0, y: 0, ...size },
    inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  });
  const group: GpuPreviewGroup = {
    kind: 'group',
    output: size,
    logical: size,
    layers: [layer(), layer()],
    composition: {
      kind: 'gl-transition',
      selection: createGlTransitionSelection('Fade')!,
      progress: 0.5,
    },
  };
  const wrapper: GpuPreviewLayer = { ...layer(), source: group };
  return {
    group,
    wrapper,
    request: {
      output: size,
      logical: size,
      layers: [wrapper],
      signal: new AbortController().signal,
    },
  };
}
it(
  'retains both transition inputs, full shader coverage and private ' +
    'target accounting through graph normalization',
  () => {
    const { group, wrapper, request } = graph();
    const plan = validateGpuPreviewFrame(request, 8192);
    expect(plan.glTransitions.get(group)).toEqual(group.composition);
    expect(plan.glTransitions.get(group)).not.toBe(group.composition);
    expect(plan.targetKeys).toEqual(new Set(['/0', '/0/gl-from', '/0/gl-to']));
    const normalized = omitLeadingGroupCopies(request);
    expect(normalized.layers[0]?.source).toBe(group);
    expect(group.layers).toHaveLength(2);
    expect(gpuPreviewTextureBytes([wrapper])).toBe(64 * 36 * 4 * 4);
    const bounds = createGpuPreviewDrawBounds();
    expect(bounds(wrapper, request.output, request.logical)).toEqual([0, 0, 64, 36]);
    const lowered = resolveGpuPreviewGroupRasters({
      ...request,
      layers: [wrapper],
      sourceDensity: 2,
    });
    const source = lowered[0]!.source;
    expect('kind' in source && source.kind === 'group' && source.logical).toEqual(group.logical);
    expect('kind' in source && source.kind === 'group' && source.composition).toEqual(
      group.composition
    );
  }
);
it('refuses malformed transition composition instead of drawing its inputs with source-over', () => {
  const { group, request } = graph();
  group.layers = [group.layers[0]!];
  expect(() => validateGpuPreviewFrame(request, 8192)).toThrow('transition');
  group.layers = [...group.layers, group.layers[0]!];
  group.composition!.progress = 2;
  expect(() => validateGpuPreviewFrame(request, 8192)).toThrow('transition');
});
it(
  'shares immutable pipelines while retaining independent uniform ' +
    'buffers until the frame owner releases them',
  async () => {
    const mock = graphics();
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();
    const release = vi.fn();
    const gpu = createGlTransitionGpu({
      device,
      format: 'rgba8unorm',
      load,
      reserve: () => ({ release }),
    });
    const selection = createGlTransitionSelection('Fade')!;
    const first = await gpu.prepare(selection),
      second = await gpu.prepare(selection);
    expect(first).toBe(second);
    const texture = () =>
      device.createTexture({ size: [64, 36], format: 'rgba8unorm', usage: 0x04 | 0x10 });
    const from = texture(),
      to = texture(),
      destination = texture();
    const encode = () =>
      gpu.encode({
        encoder: device.createCommandEncoder(),
        prepared: first,
        selection,
        progress: 0.5,
        ratio: 16 / 9,
        from,
        to,
        destination,
      });
    const a = encode(),
      b = encode();
    expect(mock.device.createBuffer).toHaveBeenCalledTimes(2);
    expect(mock.device.createBuffer.mock.results[0]!.value).not.toBe(
      mock.device.createBuffer.mock.results[1]!.value
    );
    expect(release).not.toHaveBeenCalled();
    expect(mock.queue.onSubmittedWorkDone).not.toHaveBeenCalled();
    a.release();
    a.release();
    b.release();
    expect(release).toHaveBeenCalledTimes(2);
    await gpu.dispose();
    await expect(gpu.prepare(selection)).rejects.toThrow('disposed');
  }
);
it('refuses corrupted shader bytes before pipeline construction', async () => {
  const mock = graphics();
  const device = await (await navigator.gpu.requestAdapter())!.requestDevice();
  const gpu = createGlTransitionGpu({
    device,
    format: 'rgba8unorm',
    load: async () => new Uint8Array([1]),
    reserve: () => ({ release() {} }),
  });
  await expect(gpu.prepare(createGlTransitionSelection('Fade')!)).rejects.toThrow('identity');
  expect(mock.device.createShaderModule).not.toHaveBeenCalled();
  await gpu.dispose();
});

function fallbackGraphics() {
  const gl = {
    isContextLost: vi.fn(() => false),
    getError: vi.fn(() => 0),
    NO_ERROR: 0,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => 'compile failure'),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => 'link failure'),
    deleteProgram: vi.fn(),
    createTexture: vi.fn(() => ({})),
    deleteTexture: vi.fn(),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    useProgram: vi.fn(),
    bindFramebuffer: vi.fn(),
    viewport: vi.fn(),
    disable: vi.fn(),
    colorMask: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    activeTexture: vi.fn(),
    pixelStorei: vi.fn(),
    getUniformLocation: vi.fn((_program: unknown, name: string) => ({ name })),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform2iv: vi.fn(),
    uniform2fv: vi.fn(),
    uniform3fv: vi.fn(),
    uniform4fv: vi.fn(),
    drawArrays: vi.fn(),
    getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
  };
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
  };
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: (kind: string) => (kind === 'webgl2' ? gl : context),
    }),
  });
  vi.stubGlobal('location', { href: 'https://local.invalid/editor.html' });
  const fetcher = vi.fn(async (url: URL) => new Response(await load(url.pathname.slice(1))));
  vi.stubGlobal('fetch', fetcher);
  const release = vi.fn();
  const canvas = createGlTransitionCanvas({
    ownerDocument: document,
    reserve: () => ({ release }),
  });
  const input = document.createElement('canvas');
  const request = {
    selection: createGlTransitionSelection('Fade')!,
    progress: 0.5,
    ratio: 16 / 9,
    width: 64,
    height: 36,
    from: input,
    to: input,
    signal: new AbortController().signal,
    context: input.getContext('2d')!,
  };
  return { gl, context, fetcher, release, canvas, request };
}
it('executes every pinned fallback program and releases owned programs, textures and surface', async () => {
  const f = fallbackGraphics();
  for (const descriptor of GL_TRANSITIONS) {
    const selection = createGlTransitionSelection(descriptor.name)!;
    await f.canvas.render({ ...f.request, selection });
  }
  expect(f.gl.drawArrays).toHaveBeenCalledTimes(214);
  expect(f.context.drawImage).toHaveBeenCalledTimes(214);
  expect(f.gl.getProgramParameter).toHaveBeenCalledTimes(214);
  await f.canvas.render({ ...f.request, width: 128, height: 72 });
  expect(f.gl.getProgramParameter).toHaveBeenCalledTimes(214);
  expect(f.release).toHaveBeenCalledOnce();
  f.canvas.dispose();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(f.gl.deleteProgram).toHaveBeenCalledTimes(214);
  expect(f.gl.deleteTexture.mock.calls.length).toBe(f.gl.createTexture.mock.calls.length);
  await expect(f.canvas.render(f.request)).rejects.toThrow('disposed');
});
it.each(['compile', 'link', 'draw', 'lost'])(
  'refuses fallback %s failure without publishing a partial frame',
  async (failure) => {
    const f = fallbackGraphics();
    if (failure === 'compile') f.gl.getShaderParameter.mockReturnValue(false);
    if (failure === 'link') f.gl.getProgramParameter.mockReturnValue(false);
    if (failure === 'draw') f.gl.getError.mockReturnValue(1280);
    if (failure === 'lost') f.gl.isContextLost.mockReturnValue(true);
    await expect(f.canvas.render(f.request)).rejects.toThrow();
    expect(f.context.drawImage).not.toHaveBeenCalled();
    f.canvas.dispose();
  }
);
it('loads only bounded local GL resources and refuses missing, bodyless and oversized responses', async () => {
  const f = fallbackGraphics();
  const path = GL_TRANSITIONS[0]!.implementation.glsl3.path;
  expect(await loadLocalGlTransitionAsset(path)).toEqual(await load(path));
  expect(f.fetcher).toHaveBeenCalledWith(
    new URL(path, 'https://local.invalid/'),
    expect.objectContaining({
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
  );
  await expect(loadLocalGlTransitionAsset('https://external.invalid/a.glsl')).rejects.toThrow(
    'path'
  );
  f.fetcher.mockResolvedValueOnce(new Response(null, { status: 404 }));
  await expect(loadLocalGlTransitionAsset(path)).rejects.toThrow('unavailable');
  f.fetcher.mockResolvedValueOnce(new Response(null));
  await expect(loadLocalGlTransitionAsset(path)).rejects.toThrow('body');
  f.fetcher.mockResolvedValueOnce(new Response(new Uint8Array(1024 * 1024 + 1)));
  await expect(loadLocalGlTransitionAsset(path)).rejects.toThrow('budget');
});
it('uploads pinned GPU texture resources once and frees them only when the owner retires', async () => {
  const f = graphics();
  const writeTexture = vi.fn();
  Object.assign(f.queue, { writeTexture });
  const device = await (await navigator.gpu.requestAdapter())!.requestDevice();
  const release = vi.fn();
  const gpu = createGlTransitionGpu({
    device,
    format: 'rgba8unorm',
    load,
    reserve: () => ({ release }),
  });
  const descriptor = GL_TRANSITIONS.find((item) => item.textures.length > 0)!;
  const selection = createGlTransitionSelection(descriptor.name)!;
  const prepared = await gpu.prepare(selection);
  expect(await gpu.prepare(selection)).toBe(prepared);
  expect(writeTexture).toHaveBeenCalledOnce();
  expect(release).not.toHaveBeenCalled();
  const owned = f.device.createTexture.mock.results[0]!.value;
  await gpu.dispose();
  expect(owned.destroy).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
  await gpu.dispose();
  expect(release).toHaveBeenCalledOnce();
});
