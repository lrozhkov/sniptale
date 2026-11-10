import { afterEach, expect, it, vi } from 'vitest';
import { installEffectGpuPlanCompletionObserver } from './effect-gpu-plan-completion';

const nativeStringify = JSON.stringify;
afterEach(() => {
  JSON.stringify = nativeStringify;
  vi.unstubAllGlobals();
});
function fixture() {
  class Canvas {
    constructor(
      public width: number,
      public height: number
    ) {}
  }
  class Bitmap {}
  class Frame {}
  class Port {
    private listener: ((event: { data: unknown }) => void) | null = null;
    get onmessage() {
      return this.listener;
    }
    set onmessage(value: ((event: { data: unknown }) => void) | null) {
      this.listener = value;
    }
    receive(data: unknown) {
      this.listener?.({ data });
    }
  }
  class Texture {
    createView() {
      return {};
    }
  }
  class Pass {
    setBindGroup(_index: number, _group: object) {}
    draw() {}
    end() {}
  }
  class Encoder {
    beginRenderPass(_descriptor: object) {
      return new Pass();
    }
    finish() {
      return {};
    }
  }
  class Device {
    createTexture(_descriptor: object) {
      return new Texture();
    }
    importExternalTexture(_descriptor: object) {
      return {};
    }
    createBindGroup(_descriptor: object) {
      return {};
    }
  }
  let resolve!: () => void, reject!: () => void;
  const completed = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  class Queue {
    copyExternalImageToTexture(_source: object, _destination: object) {}
    submit(_buffers: object[]) {}
    onSubmittedWorkDone() {
      return completed;
    }
  }
  const target = {};
  Object.assign(target, { top: target });
  const receive = vi.fn();
  for (const [name, value] of Object.entries({
    window: target,
    OffscreenCanvas: Canvas,
    ImageBitmap: Bitmap,
    VideoFrame: Frame,
    MessagePort: Port,
    GPUTexture: Texture,
    GPUDevice: Device,
    GPUCommandEncoder: Encoder,
    GPUQueue: Queue,
    receivePlan: receive,
  }))
    vi.stubGlobal(name, value);
  installEffectGpuPlanCompletionObserver('receivePlan');
  const queue = new Queue(),
    device = new Device(),
    bitmap = new Bitmap(),
    port = new Port();
  port.onmessage = () => {};
  port.receive({ kind: 'gpu-plan', requestId: 'request', resources: [{ bitmap }] });
  const submit = (video: boolean, draw = true) => {
    const texture = new Texture();
    queue.copyExternalImageToTexture({ source: bitmap }, { texture });
    const resources: object[] = [texture.createView()];
    if (video) resources.push(device.importExternalTexture({ source: new Frame() }));
    const group = device.createBindGroup({ entries: resources.map((resource) => ({ resource })) });
    const encoder = new Encoder(),
      output = new Texture();
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: output.createView() }] });
    pass.setBindGroup(0, group);
    if (draw) pass.draw();
    pass.end();
    queue.submit([encoder.finish()]);
  };
  return { submit, receive, resolve, reject, port, device, queue, Encoder, Frame, Canvas };
}
it('counts only after submitted annotation and video work reaches a successful fence', async () => {
  const f = fixture();
  f.submit(true);
  expect(f.receive).not.toHaveBeenCalled();
  f.resolve();
  await Promise.resolve();
  expect(f.receive).toHaveBeenCalledExactlyOnceWith(['request']);
});
it.each(['unrelated', 'no-draw', 'failed'] as const)(
  'rejects %s completion evidence',
  async (kind) => {
    const f = fixture();
    f.submit(kind !== 'unrelated', kind !== 'no-draw');
    if (kind === 'failed') f.reject();
    else f.resolve();
    await Promise.resolve();
    expect(f.receive).not.toHaveBeenCalled();
  }
);

it('tracks retained paint uploads and current identities through a completed parent scene', async () => {
  const f = fixture();
  const paint = { draw: { op: 'fillRect', args: [0, 0, 8, 6] } };
  f.port.receive({
    kind: 'gpu-plan',
    requestId: 'paint-first',
    resources: [{ kind: 'paint', width: 8, height: 6, paint }],
  });
  JSON.stringify(paint);
  const texture = f.device.createTexture({ size: [8, 6] });
  f.queue.copyExternalImageToTexture({ source: new f.Canvas(8, 6) }, { texture });
  const submit = () => {
    const group = f.device.createBindGroup({
      entries: [
        { resource: texture.createView() },
        { resource: f.device.importExternalTexture({ source: new f.Frame() }) },
      ],
    });
    const encoder = new f.Encoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [] });
    pass.setBindGroup(0, group);
    pass.draw();
    pass.end();
    f.queue.submit([encoder.finish()]);
  };
  submit();
  expect(f.receive).not.toHaveBeenCalled();
  f.resolve();
  await Promise.resolve();
  expect(f.receive).toHaveBeenCalledWith(['paint-first']);
  const next = { draw: { op: 'fillRect', args: [0, 0, 8, 6] } };
  f.port.receive({
    kind: 'gpu-plan',
    requestId: 'paint-cached',
    resources: [{ kind: 'paint', width: 8, height: 6, paint: next }],
  });
  JSON.stringify(next);
  // The existing texture supplies the same contents without another allocation/upload.
  submit();
  await Promise.resolve();
  expect(f.receive).toHaveBeenLastCalledWith(['paint-first', 'paint-cached']);
});

it('does not attribute an unrelated allocation to a serialized paint plan', async () => {
  const f = fixture();
  const paint = { draw: { op: 'fillRect', args: [0, 0, 8, 6] } };
  f.port.receive({
    kind: 'gpu-plan',
    requestId: 'paint-unused',
    resources: [{ kind: 'paint', width: 8, height: 6, paint }],
  });
  JSON.stringify(paint);
  f.device.createTexture({ size: [80, 60] });
  f.submit(true);
  f.resolve();
  await Promise.resolve();
  expect(f.receive).not.toHaveBeenCalledWith(['paint-unused']);
});
