import { afterEach, expect, it, vi } from 'vitest';
import { installEffectGpuPlanCompletionObserver } from './effect-gpu-plan-completion';

const nativeStringify = JSON.stringify;
afterEach(() => {
  JSON.stringify = nativeStringify;
  vi.unstubAllGlobals();
});
function fixture(
  kind: 'gpu-plan' | 'frame' = 'gpu-plan',
  correlated = true,
  mismatch: 'port' | 'ack' | null = null
) {
  class Canvas {
    constructor(
      public width: number,
      public height: number
    ) {}
  }
  class Bitmap {}
  class Frame {}
  class Port {
    postMessage(_message: unknown, _transfer?: readonly object[]) {}
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
  class Channel {
    port1 = new Port();
    port2 = new Port();
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
    MessageChannel: Channel,
    GPUTexture: Texture,
    GPUDevice: Device,
    GPUCommandEncoder: Encoder,
    GPUQueue: Queue,
    receivePlan: receive,
  }))
    vi.stubGlobal(name, value);
  installEffectGpuPlanCompletionObserver('receivePlan');
  const ActualChannel = globalThis.MessageChannel as unknown as typeof Channel;
  const reply = new ActualChannel();
  const queue = new Queue(),
    device = new Device(),
    bitmap = new Bitmap(),
    port = mismatch === 'port' ? new ActualChannel().port1 : reply.port1;
  const control = new Port();
  port.onmessage = () => {};
  const identity = {
    requestId: 'request',
    effectInstanceId: 'annotation',
    snapshotId: 'snapshot',
    sequenceId: 0,
  };
  if (kind === 'frame' && correlated)
    control.postMessage(
      {
        type: 'sniptale:effect-runtime:render',
        request: {
          kind: 'renderFrame',
          protocolVersion: 7,
          ...identity,
          documentRef: { id: 'a'.repeat(64) },
          assetSelectionRef: { id: 'b'.repeat(64) },
        },
      },
      [reply.port2]
    );
  port.receive(
    kind === 'frame'
      ? {
          kind,
          ...identity,
          bitmap,
          acknowledged: {
            documentId: (mismatch === 'ack' ? 'c' : 'a').repeat(64),
            assetSelectionId: 'b'.repeat(64),
          },
        }
      : { kind, requestId: 'request', resources: [{ bitmap }] }
  );
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

it('tracks bitmap-only Lottie output through the submitted parent video scene and completion fence', async () => {
  const f = fixture('frame');
  f.submit(true);
  expect(f.receive).not.toHaveBeenCalled();
  f.resolve();
  await Promise.resolve();
  expect(f.receive).toHaveBeenCalledExactlyOnceWith(['request']);
});
it.each(['unrelated', 'no-draw', 'failed'] as const)(
  'refuses %s GPU evidence for bitmap-only Lottie output',
  async (kind) => {
    const f = fixture('frame');
    f.submit(kind !== 'unrelated', kind !== 'no-draw');
    if (kind === 'failed') f.reject();
    else f.resolve();
    await Promise.resolve();
    expect(f.receive).not.toHaveBeenCalled();
  }
);

it('does not attribute an uncorrelated bitmap reply to annotation GPU work', async () => {
  const f = fixture('frame', false);
  f.submit(true);
  f.resolve();
  await Promise.resolve();
  expect(f.receive).not.toHaveBeenCalled();
});

it('keeps attributing a retained Lottie bitmap when placement updates submit another parent scene', async () => {
  const f = fixture('frame');
  f.submit(true);
  f.resolve();
  await Promise.resolve();
  expect(f.receive).toHaveBeenCalledTimes(1);
  f.submit(true);
  await Promise.resolve();
  expect(f.receive).toHaveBeenCalledTimes(2);
  expect(f.receive.mock.calls).toEqual([[['request']], [['request']]]);
});

it.each(['port', 'ack'] as const)(
  'does not attribute a bitmap with mismatched %s evidence',
  async (mismatch) => {
    const f = fixture('frame', true, mismatch);
    f.submit(true);
    f.resolve();
    await Promise.resolve();
    expect(f.receive).not.toHaveBeenCalled();
  }
);
