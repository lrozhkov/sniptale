export type CropRect = { x: number; y: number; width: number; height: number };
export type OutputSize = { width: number; height: number };

export type CropStreamGeometry = {
  outputSize: OutputSize;
  sourceRect: CropRect;
};

export type CropStreamDrawStateResult = 'applied' | 'stale';

export type CropStreamControls = {
  activate(): void;
  applyFreshGeometry(transitionId: string, geometry: CropStreamGeometry): CropStreamDrawStateResult;
  setFrozen(transitionId: string, frozen: boolean): CropStreamDrawStateResult;
  waitForFreshFrame(transitionId: string): Promise<OutputSize>;
};

export type CropFrameGate = CropStreamControls & {
  canDraw(): boolean;
  canEmitHeldFrame(): boolean;
  stop(): void;
};

type PendingFrame = {
  callbackId: number;
  promise: Promise<OutputSize>;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  transitionId: string;
};

type CropFrameGateParams = {
  applyGeometry: (geometry: CropStreamGeometry) => void;
  drawCurrentFrame: () => void;
  initiallySuspended: boolean;
  video: HTMLVideoElement;
};

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function requireTransitionId(transitionId: string): void {
  if (transitionId.length === 0) {
    throw new Error('Viewport draw-state transition ID is required');
  }
}

class CropFrameGateController implements CropFrameGate {
  readonly #applyGeometry: (geometry: CropStreamGeometry) => void;
  readonly #drawCurrentFrame: () => void;
  readonly #video: HTMLVideoElement;
  #activated: boolean;
  #freshFrameObservedBy: string | null = null;
  #frozenBy: string | null = null;
  #geometryReadyBy: string | null = null;
  #lastCompletedTransitionId: string | null = null;
  #pendingFrame: PendingFrame | null = null;
  readonly #retiredTransitionIds = new Set<string>();
  #stopped = false;

  constructor(params: CropFrameGateParams) {
    this.#activated = !params.initiallySuspended;
    this.#applyGeometry = params.applyGeometry;
    this.#drawCurrentFrame = params.drawCurrentFrame;
    this.#video = params.video;
  }

  activate(): void {
    if (this.#stopped || this.#activated) return;
    this.#activated = true;
    try {
      this.#drawActivatedFrame();
    } catch (error) {
      this.#activated = false;
      throw error;
    }
  }

  applyFreshGeometry(
    transitionId: string,
    geometry: CropStreamGeometry
  ): CropStreamDrawStateResult {
    requireTransitionId(transitionId);
    if (this.#stopped || this.#frozenBy !== transitionId) return 'stale';
    if (this.#freshFrameObservedBy !== transitionId && this.#geometryReadyBy !== transitionId) {
      throw new Error('Viewport output cannot apply geometry before a fresh source frame');
    }
    this.#applyGeometry(geometry);
    this.#freshFrameObservedBy = null;
    this.#geometryReadyBy = transitionId;
    return 'applied';
  }

  canDraw(): boolean {
    return !this.#stopped && this.#activated && this.#frozenBy === null;
  }

  canEmitHeldFrame(): boolean {
    return !this.#stopped && this.#activated && this.#frozenBy !== null;
  }

  setFrozen(transitionId: string, frozen: boolean): CropStreamDrawStateResult {
    requireTransitionId(transitionId);
    if (this.#stopped) return 'stale';
    return frozen ? this.#freeze(transitionId) : this.#thaw(transitionId);
  }

  stop(): void {
    this.#stopped = true;
    this.#activated = false;
    this.#frozenBy = null;
    this.#freshFrameObservedBy = null;
    this.#geometryReadyBy = null;
    this.#lastCompletedTransitionId = null;
    this.#retiredTransitionIds.clear();
    this.#cancelPendingFrame('Viewport fresh-frame wait was cancelled');
  }

  waitForFreshFrame(transitionId: string): Promise<OutputSize> {
    requireTransitionId(transitionId);
    if (this.#stopped) return Promise.reject(new Error('Viewport output is unavailable'));
    if (this.#frozenBy !== transitionId) {
      return Promise.reject(new Error('Viewport fresh-frame wait was superseded'));
    }
    if (this.#freshFrameObservedBy === transitionId || this.#geometryReadyBy === transitionId) {
      return Promise.resolve(this.#readSourceSize());
    }
    if (this.#pendingFrame?.transitionId === transitionId) {
      return this.#pendingFrame.promise;
    }
    this.#requireFrameCallbackSupport();
    return this.#createFreshFrameWait(transitionId);
  }

  #cancelPendingFrame(message: string): void {
    const pending = this.#pendingFrame;
    if (!pending) return;
    this.#pendingFrame = null;
    clearTimeout(pending.timeoutId);
    this.#video.cancelVideoFrameCallback(pending.callbackId);
    pending.reject(new Error(message));
  }

  #completeFreshFrameWait(
    callbackId: number,
    transitionId: string,
    resolve: (size: OutputSize) => void,
    reject: (error: Error) => void
  ): void {
    const pending = this.#pendingFrame;
    if (!pending || pending.callbackId !== callbackId) return;
    this.#pendingFrame = null;
    clearTimeout(pending.timeoutId);
    if (this.#stopped || this.#frozenBy !== transitionId) {
      reject(new Error('Viewport fresh-frame wait was superseded'));
      return;
    }
    try {
      const sourceSize = this.#readSourceSize();
      this.#freshFrameObservedBy = transitionId;
      resolve(sourceSize);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  #createFreshFrameWait(transitionId: string): Promise<OutputSize> {
    let rejectFrame!: (error: Error) => void;
    let resolveFrame!: (size: OutputSize) => void;
    const promise = new Promise<OutputSize>((resolve, reject) => {
      rejectFrame = reject;
      resolveFrame = resolve;
    });
    const callbackId = this.#video.requestVideoFrameCallback(() => {
      this.#completeFreshFrameWait(callbackId, transitionId, resolveFrame, rejectFrame);
    });
    const timeoutId = setTimeout(() => {
      if (this.#pendingFrame?.callbackId !== callbackId) return;
      this.#cancelPendingFrame('Timed out waiting for a fresh viewport source frame');
    }, 10_000);
    this.#pendingFrame = {
      callbackId,
      promise,
      reject: rejectFrame,
      timeoutId,
      transitionId,
    };
    return promise;
  }

  #drawActivatedFrame(): void {
    if (!this.canDraw()) return;
    this.#drawCurrentFrame();
  }

  #freeze(transitionId: string): CropStreamDrawStateResult {
    if (this.#retiredTransitionIds.has(transitionId)) return 'stale';
    if (this.#lastCompletedTransitionId === transitionId) return 'stale';
    if (this.#frozenBy === transitionId) return 'applied';
    this.#cancelPendingFrame('Viewport fresh-frame wait was superseded');
    if (this.#frozenBy) this.#retiredTransitionIds.add(this.#frozenBy);
    if (this.#lastCompletedTransitionId) {
      this.#retiredTransitionIds.add(this.#lastCompletedTransitionId);
      this.#lastCompletedTransitionId = null;
    }
    this.#frozenBy = transitionId;
    this.#freshFrameObservedBy = null;
    this.#geometryReadyBy = null;
    return 'applied';
  }

  #readSourceSize(): OutputSize {
    return {
      height: requirePositiveInteger(this.#video.videoHeight, 'Crop source height'),
      width: requirePositiveInteger(this.#video.videoWidth, 'Crop source width'),
    };
  }

  #requireFrameCallbackSupport(): void {
    if (typeof this.#video.requestVideoFrameCallback !== 'function') {
      throw new Error('Video frame callback is unavailable for viewport source revalidation');
    }
    if (typeof this.#video.cancelVideoFrameCallback !== 'function') {
      throw new Error(
        'Video frame callback cancellation is unavailable for viewport source revalidation'
      );
    }
  }

  #thaw(transitionId: string): CropStreamDrawStateResult {
    if (this.#retiredTransitionIds.has(transitionId)) return 'stale';
    if (this.#lastCompletedTransitionId === transitionId) return 'applied';
    if (this.#frozenBy !== transitionId) return 'stale';
    if (this.#geometryReadyBy !== transitionId) {
      throw new Error('Viewport output cannot resume before fresh source geometry is applied');
    }
    this.#frozenBy = null;
    try {
      this.#drawActivatedFrame();
    } catch (error) {
      this.#frozenBy = transitionId;
      throw error;
    }
    this.#lastCompletedTransitionId = transitionId;
    this.#freshFrameObservedBy = null;
    this.#geometryReadyBy = null;
    return 'applied';
  }
}

export function createCropFrameGate(params: CropFrameGateParams): CropFrameGate {
  return new CropFrameGateController(params);
}
