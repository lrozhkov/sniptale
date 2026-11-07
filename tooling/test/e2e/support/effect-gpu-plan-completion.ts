/** Test-only provenance observer. Request identities stay in the Playwright process memory. */
export function installEffectGpuPlanCompletionObserver(binding: string): void {
  if (window !== window.top || typeof GPUQueue === 'undefined') return;
  const counters = {
    plans: 0,
    uploads: 0,
    videos: 0,
    groups: 0,
    draws: 0,
    submittedPlans: 0,
    submittedVideo: 0,
    completed: 0,
  };
  Reflect.set(globalThis, 'sniptaleTestEffectGpuEvidence', counters);
  type Proof = { ids: Set<string>; video: boolean };
  const empty = (): Proof => ({ ids: new Set(), video: false });
  const merge = (target: Proof, value?: Proof) => {
    if (!value) return;
    for (const id of value.ids) target.ids.add(id);
    target.video ||= value.video;
  };
  const resources = new WeakMap<object, Proof>();
  const views = new WeakMap<object, object>();
  const groups = new WeakMap<object, Proof>();
  const encoders = new WeakMap<object, Proof>();
  const buffers = new WeakMap<object, Proof>();
  const object = (value: unknown): value is object => typeof value === 'object' && value !== null;
  const get = (value: unknown, key: string): unknown =>
    object(value) ? Reflect.get(value, key) : undefined;
  const proof = (value: unknown) =>
    object(value) ? resources.get(views.get(value) ?? value) : undefined;
  const hook = (
    prototype: object,
    name: string,
    handler: (receiver: object, args: unknown[], result: unknown) => void
  ) => {
    const original: unknown = Reflect.get(prototype, name);
    if (typeof original !== 'function')
      throw new Error('GPU completion observation is unavailable.');
    Reflect.set(prototype, name, function (this: object, ...args: unknown[]) {
      const result: unknown = Reflect.apply(original, this, args);
      handler(this, args, result);
      return result;
    });
  };
  const descriptor = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage');
  const setter = descriptor?.set;
  if (!descriptor || !setter) throw new Error('Effect result observation is unavailable.');
  Object.defineProperty(MessagePort.prototype, 'onmessage', {
    ...descriptor,
    set(this: MessagePort, listener: unknown) {
      const wrapped =
        typeof listener !== 'function'
          ? listener
          : function (this: MessagePort, event: MessageEvent<unknown>) {
              const result = event.data,
                id = get(result, 'requestId'),
                rasters = get(result, 'resources');
              if (
                get(result, 'kind') === 'gpu-plan' &&
                typeof id === 'string' &&
                Array.isArray(rasters)
              ) {
                counters.plans++;
                const progress: unknown = Reflect.get(globalThis, binding + 'Progress');
                if (typeof progress === 'function')
                  Reflect.apply(progress, globalThis, [{ ...counters }]);
                for (const raster of rasters) {
                  const bitmap = get(raster, 'bitmap');
                  if (bitmap instanceof ImageBitmap)
                    resources.set(bitmap, { ids: new Set([id]), video: false });
                }
              }
              Reflect.apply(listener, this, [event]);
            };
      Reflect.apply(setter, this, [wrapped]);
    },
  });
  hook(GPUTexture.prototype, 'createView', (texture, _args, view) => {
    if (object(view)) views.set(view, texture);
  });
  hook(GPUQueue.prototype, 'copyExternalImageToTexture', (_queue, args) => {
    const texture = get(args[1], 'texture'),
      source = get(args[0], 'source');
    if (!object(texture)) return;
    const uploaded = empty();
    merge(uploaded, proof(source));
    uploaded.video ||= typeof VideoFrame !== 'undefined' && source instanceof VideoFrame;
    if (uploaded.ids.size) counters.uploads++;
    if (uploaded.video) counters.videos++;
    resources.set(texture, uploaded);
  });
  hook(GPUDevice.prototype, 'importExternalTexture', (_device, args, texture) => {
    if (!object(texture)) return;
    const source = get(args[0], 'source');
    counters.videos++;
    resources.set(texture, {
      ids: new Set(),
      video: typeof VideoFrame !== 'undefined' && source instanceof VideoFrame,
    });
  });
  hook(GPUDevice.prototype, 'createBindGroup', (_device, args, group) => {
    if (!object(group)) return;
    const value = empty(),
      entries = get(args[0], 'entries');
    if (Array.isArray(entries))
      for (const entry of entries) merge(value, proof(get(entry, 'resource')));
    if (value.ids.size) counters.groups++;
    groups.set(group, value);
  });
  hook(GPUCommandEncoder.prototype, 'beginRenderPass', (encoder, args, pass) => {
    if (!object(pass)) return;
    const active = new Map<number, object>(),
      rendered = empty();
    const attachments = get(args[0], 'colorAttachments');
    const targets = Array.isArray(attachments)
      ? attachments.flatMap((attachment) => {
          const view = get(attachment, 'view');
          return object(view) ? [views.get(view) ?? view] : [];
        })
      : [];
    const nativeSet = Reflect.get(pass, 'setBindGroup'),
      nativeDraw = Reflect.get(pass, 'draw'),
      nativeEnd = Reflect.get(pass, 'end');
    Reflect.set(pass, 'setBindGroup', function (this: object, ...values: unknown[]) {
      if (typeof values[0] === 'number') {
        if (object(values[1])) active.set(values[0], values[1]);
        else active.delete(values[0]);
      }
      return Reflect.apply(nativeSet, this, values);
    });
    Reflect.set(pass, 'draw', function (this: object, ...values: unknown[]) {
      for (const group of active.values()) merge(rendered, groups.get(group));
      if (rendered.ids.size) counters.draws++;
      return Reflect.apply(nativeDraw, this, values);
    });
    Reflect.set(pass, 'end', function (this: object, ...values: unknown[]) {
      const result: unknown = Reflect.apply(nativeEnd, this, values);
      for (const target of targets) resources.set(target, rendered);
      encoders.set(encoder, rendered);
      return result;
    });
  });
  hook(GPUCommandEncoder.prototype, 'finish', (encoder, _args, buffer) => {
    if (object(buffer)) buffers.set(buffer, encoders.get(encoder) ?? empty());
  });
  const completed = GPUQueue.prototype.onSubmittedWorkDone;
  hook(GPUQueue.prototype, 'submit', (queue, args) => {
    const submitted = args[0],
      value = empty();
    if (Array.isArray(submitted))
      for (const buffer of submitted) if (object(buffer)) merge(value, buffers.get(buffer));
    if (value.ids.size) counters.submittedPlans++;
    if (value.video) counters.submittedVideo++;
    const progress: unknown = Reflect.get(globalThis, binding + 'Progress');
    if (typeof progress === 'function') Reflect.apply(progress, globalThis, [{ ...counters }]);
    if (!value.video || value.ids.size === 0) return;
    const ids = [...value.ids];
    void completed.call(queue).then(
      () => {
        counters.completed++;
        const receive: unknown = Reflect.get(globalThis, binding);
        if (typeof receive === 'function') Reflect.apply(receive, globalThis, [ids]);
      },
      () => {}
    );
  });
}
