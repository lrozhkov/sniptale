export type CropRect = { x: number; y: number; width: number; height: number };
export type OutputSize = { width: number; height: number };

export type CropStreamGeometry = {
  outputSize: OutputSize;
  sourceRect: CropRect;
};

export type CropStreamDrawStateResult = 'applied' | 'stale';

export type CropStreamControls = {
  activate(): void;
  applyFrozenSourceGeometry(
    transitionId: string,
    geometry: CropStreamGeometry
  ): CropStreamDrawStateResult;
  readFrozenSourceSize(transitionId: string): OutputSize;
  setFrozen(transitionId: string, frozen: boolean): CropStreamDrawStateResult;
};

export type CropFrameGate = CropStreamControls & {
  canDraw(): boolean;
  canEmitHeldFrame(): boolean;
  stop(): void;
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
  #frozenBy: string | null = null;
  #geometryReadyBy: string | null = null;
  #lastCompletedTransitionId: string | null = null;
  readonly #retiredTransitionIds = new Set<string>();
  #sourceSizeReadBy: string | null = null;
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

  applyFrozenSourceGeometry(
    transitionId: string,
    geometry: CropStreamGeometry
  ): CropStreamDrawStateResult {
    requireTransitionId(transitionId);
    if (this.#stopped || this.#frozenBy !== transitionId) return 'stale';
    if (this.#sourceSizeReadBy !== transitionId && this.#geometryReadyBy !== transitionId) {
      throw new Error('Viewport output cannot apply geometry before reading the frozen source');
    }
    this.#applyGeometry(geometry);
    this.#sourceSizeReadBy = null;
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
    this.#geometryReadyBy = null;
    this.#lastCompletedTransitionId = null;
    this.#retiredTransitionIds.clear();
    this.#sourceSizeReadBy = null;
  }

  readFrozenSourceSize(transitionId: string): OutputSize {
    requireTransitionId(transitionId);
    if (this.#stopped) throw new Error('Viewport output is unavailable');
    if (this.#frozenBy !== transitionId) {
      throw new Error('Viewport frozen-source read was superseded');
    }
    const sourceSize = this.#readSourceSize();
    this.#sourceSizeReadBy = transitionId;
    return sourceSize;
  }

  #drawActivatedFrame(): void {
    if (!this.canDraw()) return;
    this.#drawCurrentFrame();
  }

  #freeze(transitionId: string): CropStreamDrawStateResult {
    if (this.#retiredTransitionIds.has(transitionId)) return 'stale';
    if (this.#lastCompletedTransitionId === transitionId) return 'stale';
    if (this.#frozenBy === transitionId) return 'applied';
    if (this.#frozenBy) this.#retiredTransitionIds.add(this.#frozenBy);
    if (this.#lastCompletedTransitionId) {
      this.#retiredTransitionIds.add(this.#lastCompletedTransitionId);
      this.#lastCompletedTransitionId = null;
    }
    this.#frozenBy = transitionId;
    this.#geometryReadyBy = null;
    this.#sourceSizeReadBy = null;
    return 'applied';
  }

  #readSourceSize(): OutputSize {
    return {
      height: requirePositiveInteger(this.#video.videoHeight, 'Crop source height'),
      width: requirePositiveInteger(this.#video.videoWidth, 'Crop source width'),
    };
  }

  #thaw(transitionId: string): CropStreamDrawStateResult {
    if (this.#retiredTransitionIds.has(transitionId)) return 'stale';
    if (this.#lastCompletedTransitionId === transitionId) return 'applied';
    if (this.#frozenBy !== transitionId) return 'stale';
    if (this.#geometryReadyBy !== transitionId) {
      throw new Error('Viewport output cannot resume before frozen source geometry is applied');
    }
    this.#frozenBy = null;
    try {
      this.#drawActivatedFrame();
    } catch (error) {
      this.#frozenBy = transitionId;
      throw error;
    }
    this.#lastCompletedTransitionId = transitionId;
    this.#geometryReadyBy = null;
    this.#sourceSizeReadBy = null;
    return 'applied';
  }
}

export function createCropFrameGate(params: CropFrameGateParams): CropFrameGate {
  return new CropFrameGateController(params);
}
