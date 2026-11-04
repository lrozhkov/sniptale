import { vi } from 'vitest';

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export function graphics() {
  const lost = deferred<{ message: string }>();
  const bitmap = { close: vi.fn(), width: 64, height: 36 };
  const transfer = vi.fn(() => bitmap);
  let textureSequence = 0;
  const commands: string[] = [];
  const texture = (width: number, height: number) => {
    const textureId = ++textureSequence;
    return {
      width,
      height,
      textureId,
      createView: vi.fn((descriptor?: GPUTextureViewDescriptor) => ({ textureId, ...descriptor })),
      destroy: vi.fn(),
    };
  };
  const pass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(() => {
      commands.push('draw');
    }),
    end: vi.fn(() => {
      commands.push('end');
    }),
  };
  const context = {
    configure: vi.fn(),
    unconfigure: vi.fn(),
    getCurrentTexture: vi.fn(() => texture(64, 36)),
  };
  const queue = {
    copyExternalImageToTexture: vi.fn(),
    writeBuffer: vi.fn(),
    submit: vi.fn(),
    onSubmittedWorkDone: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  };
  const device = {
    lost: lost.promise,
    limits: { maxTextureDimension2D: 8192 },
    queue,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    createShaderModule: vi.fn(() => ({})),
    createRenderPipelineAsync: vi.fn(async (_descriptor: GPURenderPipelineDescriptor) => ({
      getBindGroupLayout: vi.fn(() => ({})),
    })),
    createSampler: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createTexture: vi.fn(
      ({ size }: { size: number[]; mipLevelCount?: number; format?: GPUTextureFormat }) =>
        texture(size[0] ?? 0, size[1] ?? 0)
    ),
    importExternalTexture: vi.fn(() => ({})),
    createBindGroup: vi.fn((_descriptor: GPUBindGroupDescriptor) => ({})),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: vi.fn((_descriptor: GPURenderPassDescriptor) => {
        commands.push('begin');
        return pass;
      }),
      finish: vi.fn(() => ({})),
    })),
    pushErrorScope: vi.fn(),
    popErrorScope: vi.fn<() => Promise<{ message: string } | null>>(() => Promise.resolve(null)),
    destroy: vi.fn(),
  };
  const adapter = { requestDevice: vi.fn(async () => device) };
  const gpu = {
    requestAdapter: vi.fn<() => Promise<typeof adapter | null>>(async () => adapter),
    getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm'),
  };
  vi.stubGlobal('navigator', { gpu });
  vi.stubGlobal('GPUTextureUsage', { TEXTURE_BINDING: 1, COPY_DST: 2, RENDER_ATTACHMENT: 4 });
  vi.stubGlobal('GPUBufferUsage', { UNIFORM: 1, COPY_DST: 2 });
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        public width: number,
        public height: number
      ) {}
      getContext() {
        return context;
      }
      transferToImageBitmap() {
        return transfer();
      }
    }
  );
  vi.stubGlobal(
    'VideoFrame',
    class {
      close = vi.fn();
      constructor(_source: CanvasImageSource) {}
    }
  );
  const reserve = vi.fn((_bytes: number) => ({ release: vi.fn() }));
  return { gpu, adapter, device, queue, pass, context, transfer, bitmap, lost, reserve, commands };
}
