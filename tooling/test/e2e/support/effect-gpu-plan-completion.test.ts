import { afterEach, expect, it, vi } from 'vitest';
import { installEffectGpuPlanCompletionObserver } from './effect-gpu-plan-completion';

afterEach(() => vi.unstubAllGlobals());
function fixture() {
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
  return { submit, receive, resolve, reject };
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
