import { closeEffectRuntimeBitmaps } from '../../contracts/effect-runtime/bitmap-lifetime';
import {
  createEffectRuntimeFailure,
  sameEffectRuntimeIdentity,
} from '../../contracts/effect-runtime/identity';
import { parseEffectRuntimeFrameResult } from '../../contracts/effect-runtime/result-boundary';
import {
  EFFECT_RUNTIME_SANDBOX_RENDER_MESSAGE,
  type EffectRuntimeFrameResult,
  type EffectRuntimeRenderMessage,
} from '../../contracts/effect-runtime/types';

export interface EffectRuntimeSandboxConnection {
  controlPort: MessagePort | null;
}

export class PendingEffectRuntimeRequest {
  private readonly channel = new MessageChannel();
  private resolve!: (result: EffectRuntimeFrameResult) => void;
  private settled = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly args: {
      active: Set<PendingEffectRuntimeRequest>;
      clearSession(): void;
      current: EffectRuntimeSandboxConnection;
      request: EffectRuntimeRenderMessage;
      timeoutMs: number;
    }
  ) {}

  get request(): EffectRuntimeRenderMessage {
    return this.args.request;
  }

  start(): Promise<EffectRuntimeFrameResult> {
    const promise = new Promise<EffectRuntimeFrameResult>((resolve) => {
      this.resolve = resolve;
    });
    this.args.active.add(this);
    this.timer = setTimeout(() => {
      this.args.clearSession();
      this.finish(createEffectRuntimeFailure(this.request, 'timeout'));
    }, this.args.timeoutMs);
    this.channel.port1.onmessageerror = () => {
      this.args.clearSession();
      this.finish(createEffectRuntimeFailure(this.request, 'malformed'));
    };
    this.channel.port1.onmessage = (event) => this.handleMessage(event);
    this.channel.port1.start();
    this.postRequest();
    return promise;
  }

  finish(result: EffectRuntimeFrameResult): void {
    if (this.settled) {
      if (result.kind === 'frame') result.bitmap.close();
      return;
    }
    this.settled = true;
    if (this.timer) clearTimeout(this.timer);
    this.args.active.delete(this);
    this.channel.port1.onmessage = null;
    this.channel.port1.onmessageerror = null;
    this.channel.port1.close();
    this.resolve(result);
  }

  private handleMessage(event: MessageEvent<unknown>): void {
    if (event.ports.length !== 0) {
      for (const port of event.ports) port.close();
      closeEffectRuntimeBitmaps(event.data);
      this.finish(createEffectRuntimeFailure(this.request, 'malformed'));
      return;
    }
    const result = parseEffectRuntimeFrameResult(event.data);
    if (!result) {
      closeEffectRuntimeBitmaps(event.data);
      this.finish(createEffectRuntimeFailure(this.request, 'malformed'));
      return;
    }
    if (!sameEffectRuntimeIdentity(this.request, result)) {
      if (result.kind === 'frame') result.bitmap.close();
      this.finish(createEffectRuntimeFailure(this.request, 'stale'));
      return;
    }
    if (result.kind === 'frame' && !hasExpectedDimensions(this.request, result)) {
      result.bitmap.close();
      this.finish(createEffectRuntimeFailure(this.request, 'outputRejected'));
      return;
    }
    this.finish(result);
  }

  private postRequest(): void {
    try {
      this.args.current.controlPort!.postMessage(
        { request: this.request, type: EFFECT_RUNTIME_SANDBOX_RENDER_MESSAGE },
        [this.channel.port2, ...collectParentTransferables(this.request)]
      );
    } catch {
      closeEffectRuntimeBitmaps(this.request.inputFrames);
      this.args.clearSession();
      this.finish(createEffectRuntimeFailure(this.request, 'crashed'));
    }
  }
}

function hasExpectedDimensions(
  request: EffectRuntimeRenderMessage,
  result: Extract<EffectRuntimeFrameResult, { kind: 'frame' }>
): boolean {
  return result.width === request.renderWidth && result.height === request.renderHeight;
}

function collectParentTransferables(request: EffectRuntimeRenderMessage): Transferable[] {
  return [
    ...(request.assetSelectionRef.assets ?? []).map(({ bytes }) => bytes),
    ...Object.values(request.inputFrames).map(({ bitmap }) => bitmap),
  ];
}
