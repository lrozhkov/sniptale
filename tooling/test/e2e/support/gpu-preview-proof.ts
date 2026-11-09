import { installEffectGpuPlanCompletionObserver } from './effect-gpu-plan-completion';
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

const COMPLETED_GPU_WORK = 'sniptale-test:completed-preview-gpu-work';
const EFFECT_GPU_READY = 'sniptale-test:effect-worker-instrumented';
const EFFECT_GPU_PLAN = 'sniptale-test:effect-gpu-plan';
const EFFECT_GPU_FAILURE = 'sniptale-test:effect-failure:';
const EFFECT_GPU_FRAME = 'sniptale-test:completed-effect-gpu-frame';
const effectFailures = new WeakMap<Page, string[]>();
const effectEvidence = new WeakMap<Page, Record<string, number>>();

/** Install the raw-image guard before the first request reaches each inline effect Worker. */
export async function observeEffectGpuPlans(
  page: Page,
  options: { rejectProcessedCanvas?: boolean; requireParentScene?: boolean } = {}
): Promise<() => number> {
  const plans = new Set<string>();
  const completedFrames = new Set<string>();
  const parentScenes = new Set<string>();
  await page.exposeBinding('sniptaleTestCompletedEffectPlan', (source, ids: unknown) => {
    if (source.frame !== page.mainFrame()) return;
    if (Array.isArray(ids))
      for (const id of ids)
        if (typeof id === 'string') {
          completedFrames.add(id);
          parentScenes.add(id);
        }
  });
  await page.exposeBinding('sniptaleTestCompletedEffectPlanProgress', (source, value: unknown) => {
    if (source.frame !== page.mainFrame()) return;
    if (!value || typeof value !== 'object') return;
    const counters: Record<string, number> = {};
    for (const key of [
      'plans',
      'uploads',
      'videos',
      'groups',
      'draws',
      'submittedPlans',
      'submittedVideo',
      'completed',
    ]) {
      const count: unknown = Reflect.get(value, key);
      if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return;
      counters[key] = count;
    }
    effectEvidence.set(page, counters);
  });
  await page.addInitScript(
    installEffectGpuPlanCompletionObserver,
    'sniptaleTestCompletedEffectPlan'
  );
  const failures: string[] = [];
  effectFailures.set(page, failures);
  if (options.rejectProcessedCanvas)
    await page.addInitScript(() => {
      if (window !== window.top) return;
      const processed = new WeakSet<ImageBitmap>();
      const liveInstances = new Set<string>();
      const descriptor = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage');
      const setter = descriptor?.set;
      if (!descriptor || !setter) throw new Error('Effect result observation is unavailable.');
      Object.defineProperty(MessagePort.prototype, 'onmessage', {
        ...descriptor,
        set(this: MessagePort, listener: unknown) {
          const wrapped =
            typeof listener === 'function'
              ? function (this: MessagePort, event: MessageEvent<unknown>) {
                  const result = event.data;
                  if (
                    result &&
                    typeof result === 'object' &&
                    (Reflect.get(result, 'kind') === 'frame' ||
                      Reflect.get(result, 'kind') === 'gpu-plan') &&
                    typeof Reflect.get(result, 'effectInstanceId') === 'string'
                  ) {
                    for (const element of document.querySelectorAll(
                      '[data-annotation-effect-id]'
                    )) {
                      const id = element.getAttribute('data-annotation-effect-id');
                      if (id) liveInstances.add(id);
                    }
                    const instanceId: unknown = Reflect.get(result, 'effectInstanceId');
                    const bitmap: unknown = Reflect.get(result, 'bitmap');
                    if (
                      typeof instanceId === 'string' &&
                      liveInstances.has(instanceId) &&
                      bitmap instanceof ImageBitmap
                    )
                      processed.add(bitmap);
                    const resources: unknown = Reflect.get(result, 'resources');
                    if (
                      typeof instanceId === 'string' &&
                      liveInstances.has(instanceId) &&
                      Array.isArray(resources)
                    )
                      for (const resource of resources) {
                        const raster: unknown =
                          resource && typeof resource === 'object'
                            ? Reflect.get(resource, 'bitmap')
                            : undefined;
                        if (raster instanceof ImageBitmap) processed.add(raster);
                      }
                  }
                  Reflect.apply(listener, this, [event]);
                }
              : listener;
          Reflect.apply(setter, this, [wrapped]);
        },
      });
      const reject = (prototype: object) => {
        const draw: unknown = Reflect.get(prototype, 'drawImage');
        if (typeof draw !== 'function') throw new Error('Canvas draw observation is unavailable.');
        Reflect.set(prototype, 'drawImage', function (this: object, ...args: unknown[]) {
          const source = args[0];
          if (source instanceof ImageBitmap && processed.has(source))
            throw new Error('GPU proof rejected Canvas composition of a processed effect frame.');
          Reflect.apply(draw, this, args);
        });
      };
      reject(CanvasRenderingContext2D.prototype);
      reject(OffscreenCanvasRenderingContext2D.prototype);
    });
  page.on('console', (message) => {
    if (message.text().startsWith(EFFECT_GPU_PLAN + ':'))
      plans.add(message.text().slice(EFFECT_GPU_PLAN.length + 1));
    if (message.text().startsWith(EFFECT_GPU_FRAME + ':'))
      completedFrames.add(message.text().slice(EFFECT_GPU_FRAME.length + 1));
    if (message.text().startsWith(EFFECT_GPU_FAILURE)) failures.push(message.text());
  });
  await page.addInitScript(
    ({ failure, frame }) => {
      const post = MessagePort.prototype.postMessage;
      Reflect.set(
        MessagePort.prototype,
        'postMessage',
        function (this: MessagePort, ...args: unknown[]) {
          const value = args[0];
          if (value && typeof value === 'object' && Reflect.get(value, 'kind') === 'error') {
            const code: unknown = Reflect.get(value, 'code');
            if (typeof code === 'string') console.debug(failure + code);
          }
          if (
            value &&
            typeof value === 'object' &&
            Reflect.get(value, 'kind') === 'frame' &&
            location.pathname.endsWith('/effect-runtime-sandbox/index.html')
          ) {
            const requestId: unknown = Reflect.get(value, 'requestId');
            if (typeof requestId === 'string') console.debug(frame + ':' + requestId);
          }
          Reflect.apply(post, this, args);
        }
      );
    },
    { failure: EFFECT_GPU_FAILURE, frame: EFFECT_GPU_FRAME }
  );
  page.on('worker', (worker) => {
    if (!worker.url().startsWith('blob:null/')) return;
    void worker
      .evaluate(
        ({ ready, plan }) => {
          let gpuMode = false;
          globalThis.addEventListener(
            'message',
            (event: MessageEvent<unknown>) => {
              const value = event.data;
              gpuMode =
                !!value &&
                typeof value === 'object' &&
                Reflect.get(value, 'renderTarget') === 'gpu-plan';
            },
            { capture: true }
          );
          const draw = OffscreenCanvasRenderingContext2D.prototype.drawImage;
          Reflect.set(
            OffscreenCanvasRenderingContext2D.prototype,
            'drawImage',
            function (this: OffscreenCanvasRenderingContext2D, ...args: unknown[]) {
              const source = args[0];
              if (
                gpuMode &&
                (source instanceof ImageBitmap ||
                  (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame))
              )
                throw new Error('Effect GPU proof rejected a Canvas raw-image composition.');
              Reflect.apply(draw, this, args);
            }
          );
          const post = Reflect.get(globalThis, 'postMessage');
          if (typeof post !== 'function') throw new Error('Worker message port is unavailable.');
          Reflect.set(globalThis, 'postMessage', function (...args: unknown[]) {
            const envelope = args[0];
            if (envelope && typeof envelope === 'object') {
              const result: unknown = Reflect.get(envelope, 'result');
              if (
                result &&
                typeof result === 'object' &&
                Reflect.get(result, 'kind') === 'gpu-plan'
              ) {
                const requestId: unknown = Reflect.get(result, 'requestId');
                if (typeof requestId === 'string') console.debug(plan + ':' + requestId);
              }
            }
            return Reflect.apply(post, globalThis, args);
          });
          Reflect.apply(post, globalThis, [ready]);
        },
        { ready: EFFECT_GPU_READY, plan: EFFECT_GPU_PLAN }
      )
      .catch(() => {
        if (!page.isClosed() && page.workers().includes(worker))
          failures.push(EFFECT_GPU_FAILURE + 'workerInstrumentation');
      });
  });
  await page.addInitScript((ready) => {
    if (!location.pathname.endsWith('/effect-runtime-sandbox/index.html')) return;
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      private released = false;
      private pending: unknown[][] = [];
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', (event) => {
          if (event.data !== ready) return;
          event.stopImmediatePropagation();
          this.released = true;
          for (const args of this.pending.splice(0)) Reflect.apply(super.postMessage, this, args);
        });
      }
      override postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions
      ) {
        const args = [message, options];
        if (this.released) Reflect.apply(super.postMessage, this, args);
        else this.pending.push(args);
      }
    };
  }, EFFECT_GPU_READY);
  return () =>
    [...plans].filter((id) => (options.requireParentScene ? parentScenes : completedFrames).has(id))
      .length;
}

/** Configure the browser at file scope, independently of per-scenario GPU witnesses. */
export function configureGpuPreviewProofBrowser() {
  test.use({
    launchOptions: {
      args:
        process.platform === 'linux'
          ? [
              '--enable-unsafe-webgpu',
              '--use-angle=swiftshader',
              '--use-vulkan=swiftshader',
              '--enable-features=Vulkan',
              '--disable-vulkan-surface',
            ]
          : [],
    },
  });
}

/** Run actual editor interactions on WebGPU; Linux software proves behavior, not hardware FPS. */
export function enableGpuPreviewProof(options: { configureBrowser?: boolean } = {}) {
  if (options.configureBrowser !== false) configureGpuPreviewProofBrowser();
  const witnesses = new WeakMap<
    Page,
    {
      completed: boolean;
      listener(message: ConsoleMessage): void;
    }
  >();
  test.beforeEach(async ({ page }) => {
    const witness = {
      completed: false,
      listener(message: ConsoleMessage) {
        if (message.text() === COMPLETED_GPU_WORK) witness.completed = true;
      },
    };
    witnesses.set(page, witness);
    page.on('console', witness.listener);
    await page.addInitScript((marker) => {
      if (typeof GPUQueue === 'undefined') return;
      const submit = GPUQueue.prototype.submit;
      const completed = GPUQueue.prototype.onSubmittedWorkDone;
      let observed = false;
      GPUQueue.prototype.submit = function (...args: Parameters<GPUQueue['submit']>) {
        submit.apply(this, args);
        if (observed) return;
        observed = true;
        void completed.call(this).then(
          () => console.debug(marker),
          () => {}
        );
      };
    }, COMPLETED_GPU_WORK);
  });
  test.afterEach(async ({ page }, info) => {
    const witness = witnesses.get(page);
    try {
      const evidence = effectEvidence.get(page);
      if (info.status !== 'passed' && evidence)
        await info.attach('effect-gpu-evidence', {
          body: JSON.stringify(evidence),
          contentType: 'application/json',
        });
      const failures = effectFailures.get(page);
      if (failures?.length)
        await info.attach('effect-runtime-errors', {
          body: failures.join('\n'),
          contentType: 'text/plain',
        });
      if (info.status === 'passed')
        await expect
          .poll(() => witness?.completed ?? false, {
            message:
              'The editor must complete GPU work; a legacy-renderer pass does not prove migration.',
          })
          .toBe(true);
    } finally {
      if (witness) page.off('console', witness.listener);
      witnesses.delete(page);
      effectFailures.delete(page);
      effectEvidence.delete(page);
    }
  });
}

/** Observe native imports at bitmap publication; current PTS requires one active job per device. */
export function installCameraFrameObserver() {
  if (typeof GPUDevice === 'undefined' || typeof GPUCanvasContext === 'undefined') return;
  const surfaces = new WeakMap<HTMLCanvasElement | OffscreenCanvas, GPUDevice>();
  const bitmaps = new WeakMap<
    ImageBitmap,
    { device: GPUDevice; timestamps: number[]; current: number | null }
  >();
  const encodedFrames = new WeakMap<GPUDevice, number | null>();
  const currentFrames = new WeakMap<HTMLCanvasElement | OffscreenCanvas, number | null>();
  const publications = new WeakMap<HTMLCanvasElement | OffscreenCanvas, number[]>();
  const frames = new WeakMap<GPUDevice, number[]>();
  const createEncoder = GPUDevice.prototype.createCommandEncoder;
  GPUDevice.prototype.createCommandEncoder = function (
    this: GPUDevice,
    descriptor?: GPUCommandEncoderDescriptor
  ) {
    const encoder = Reflect.apply(createEncoder, this, [descriptor]);
    encodedFrames.set(this, null);
    return encoder;
  };
  const configure = GPUCanvasContext.prototype.configure;
  const importTexture = GPUDevice.prototype.importExternalTexture;
  GPUCanvasContext.prototype.configure = function (
    this: GPUCanvasContext,
    configuration: GPUCanvasConfiguration
  ) {
    Reflect.apply(configure, this, [configuration]);
    surfaces.set(this.canvas, configuration.device);
  };
  GPUDevice.prototype.importExternalTexture = function (
    this: GPUDevice,
    descriptor: GPUExternalTextureDescriptor
  ) {
    const result = Reflect.apply(importTexture, this, [descriptor]);
    if (descriptor.source instanceof VideoFrame) {
      const values = frames.get(this) ?? [];
      values.push(descriptor.source.timestamp);
      if (values.length > 128) values.shift();
      frames.set(this, values);
      encodedFrames.set(this, descriptor.source.timestamp);
    }
    return result;
  };
  const transferToBitmap = OffscreenCanvas.prototype.transferToImageBitmap;
  const transferFromBitmap = ImageBitmapRenderingContext.prototype.transferFromImageBitmap;
  OffscreenCanvas.prototype.transferToImageBitmap = function (this: OffscreenCanvas) {
    const bitmap = Reflect.apply(transferToBitmap, this, []);
    const device = surfaces.get(this);
    if (device) {
      bitmaps.set(bitmap, {
        device,
        timestamps: [...(frames.get(device) ?? [])],
        current: encodedFrames.get(device) ?? null,
      });
    }
    return bitmap;
  };
  ImageBitmapRenderingContext.prototype.transferFromImageBitmap = function (
    this: ImageBitmapRenderingContext,
    bitmap: ImageBitmap | null
  ) {
    const snapshot = bitmap && bitmaps.get(bitmap);
    Reflect.apply(transferFromBitmap, this, [bitmap]);
    if (snapshot) {
      surfaces.set(this.canvas, snapshot.device);
      publications.set(this.canvas, snapshot.timestamps);
      currentFrames.set(this.canvas, snapshot.current);
    } else {
      surfaces.delete(this.canvas);
      publications.delete(this.canvas);
      currentFrames.delete(this.canvas);
    }
  };
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  Reflect.set(
    CanvasRenderingContext2D.prototype,
    'drawImage',
    function (this: CanvasRenderingContext2D, ...args: unknown[]) {
      Reflect.apply(draw, this, args);
      const image = args[0];
      const snapshot = image instanceof ImageBitmap ? bitmaps.get(image) : undefined;
      if (snapshot) {
        publications.set(this.canvas, snapshot.timestamps);
        currentFrames.set(this.canvas, snapshot.current);
      }
    }
  );
  Object.defineProperty(window, 'sniptaleCurrentInspectorFrame', {
    value: (canvas: HTMLCanvasElement) => currentFrames.get(canvas) ?? null,
  });
  Object.defineProperty(window, 'sniptaleCameraFrameImports', {
    value: (canvas: HTMLCanvasElement) => {
      return [...(publications.get(canvas) ?? [])];
    },
  });
}
