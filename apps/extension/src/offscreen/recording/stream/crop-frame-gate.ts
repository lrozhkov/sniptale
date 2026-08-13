import type { ViewportFrameVerification } from '@sniptale/runtime-contracts/video/types/viewport-calibration';

export type CropRect = { x: number; y: number; width: number; height: number };
export type OutputSize = { width: number; height: number };

export type CropStreamGeometry = {
  fit?: 'contain' | 'cover' | 'source';
  outputSize: OutputSize;
  sourceRect: CropRect;
};

export type CropStreamDrawStateResult = 'applied' | 'stale';

export type VerifiedViewportFrame = {
  presentedFrames: number;
  sourceSize: OutputSize;
  viewportRect: CropRect;
};

export type VerifyViewportFrame = (
  verification: ViewportFrameVerification & {
    afterPresentedFrames?: number;
    expectedViewportRect?: CropRect;
  },
  isCurrent: () => boolean
) => Promise<VerifiedViewportFrame>;

export type CropStreamControls = {
  activate(): void;
  applyFrozenSourceGeometry(
    transitionId: string,
    geometry: CropStreamGeometry
  ): CropStreamDrawStateResult;
  readFrozenSourceSize(transitionId: string): OutputSize;
  setFrozen(transitionId: string, frozen: boolean): CropStreamDrawStateResult;
  verifyFrozenSourceFrame(
    transitionId: string,
    verification: ViewportFrameVerification
  ): Promise<{ frame?: VerifiedViewportFrame; result: CropStreamDrawStateResult }>;
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
  onSourceInvalidated?: (error: Error) => void;
  requiresFrameVerification?: boolean;
  verifyFrame?: VerifyViewportFrame;
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
  readonly #onSourceInvalidated: ((error: Error) => void) | null;
  readonly #requiresFrameVerification: boolean;
  readonly #verifyFrame: VerifyViewportFrame | null;
  #activated: boolean;
  #frozenBy: string | null = null;
  #geometryReadyBy: string | null = null;
  #lastCompletedTransitionId: string | null = null;
  readonly #retiredTransitionIds = new Set<string>();
  #sourceSizeReadBy: string | null = null;
  #stopped = false;
  #markedFrame: VerifiedViewportFrame | null = null;
  #cleanFrameVerifiedBy: string | null = null;
  #verifiedSourceSize: OutputSize | null = null;
  #sourceInvalidated = false;

  constructor(params: CropFrameGateParams) {
    this.#activated = !params.initiallySuspended;
    this.#applyGeometry = params.applyGeometry;
    this.#drawCurrentFrame = params.drawCurrentFrame;
    this.#video = params.video;
    this.#onSourceInvalidated = params.onSourceInvalidated ?? null;
    this.#requiresFrameVerification = params.requiresFrameVerification === true;
    this.#verifyFrame = params.verifyFrame ?? null;
    if (this.#requiresFrameVerification && !this.#verifyFrame) {
      throw new Error('Exact viewport output requires a frame verifier');
    }
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
    if (this.#requiresFrameVerification && this.#geometryReadyBy === transitionId) {
      throw new Error('Verified viewport source geometry cannot change during a transition');
    }
    if (
      this.#sourceSizeReadBy !== transitionId &&
      this.#geometryReadyBy !== transitionId &&
      (!this.#requiresFrameVerification || !this.#markedFrame)
    ) {
      throw new Error('Viewport output cannot apply geometry before reading the frozen source');
    }
    this.#applyGeometry(geometry);
    this.#sourceSizeReadBy = null;
    this.#geometryReadyBy = transitionId;
    return 'applied';
  }

  canDraw(): boolean {
    if (!this.#stopped && this.#verifiedSourceSize && !this.#sourceInvalidated) {
      if (
        this.#video.videoWidth !== this.#verifiedSourceSize.width ||
        this.#video.videoHeight !== this.#verifiedSourceSize.height
      ) {
        this.#sourceInvalidated = true;
        this.#frozenBy = this.#frozenBy ?? '__source-invalidated__';
        this.#onSourceInvalidated?.(
          new Error('Verified viewport source dimensions changed unexpectedly')
        );
      }
    }
    return !this.#stopped && !this.#sourceInvalidated && this.#activated && this.#frozenBy === null;
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
    this.#markedFrame = null;
    this.#cleanFrameVerifiedBy = null;
    this.#verifiedSourceSize = null;
    this.#sourceInvalidated = false;
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

  async verifyFrozenSourceFrame(
    transitionId: string,
    verification: ViewportFrameVerification
  ): Promise<{ frame?: VerifiedViewportFrame; result: CropStreamDrawStateResult }> {
    requireTransitionId(transitionId);
    if (this.#stopped || this.#frozenBy !== transitionId) return { result: 'stale' };
    if (!this.#requiresFrameVerification || !this.#verifyFrame) {
      throw new Error('Viewport frame verification is unavailable');
    }
    if (verification.phase === 'clean' && !this.#markedFrame) {
      throw new Error('Viewport clean frame cannot be verified before a marked source frame');
    }
    const markedFrame = this.#markedFrame;
    const frame = await this.#verifyFrame(
      {
        ...verification,
        ...(markedFrame ? { afterPresentedFrames: markedFrame.presentedFrames } : {}),
        ...(verification.phase === 'clean' && markedFrame
          ? { expectedViewportRect: markedFrame.viewportRect }
          : {}),
      },
      () => !this.#stopped && this.#frozenBy === transitionId
    );
    if (this.#stopped || this.#frozenBy !== transitionId) return { result: 'stale' };
    if (verification.phase === 'marked') {
      this.#markedFrame = frame;
      this.#cleanFrameVerifiedBy = null;
      this.#sourceSizeReadBy = transitionId;
    } else {
      if (
        !markedFrame ||
        frame.presentedFrames <= markedFrame.presentedFrames ||
        frame.sourceSize.width !== markedFrame.sourceSize.width ||
        frame.sourceSize.height !== markedFrame.sourceSize.height
      ) {
        throw new Error('Viewport clean source frame does not match the marked source frame');
      }
      this.#cleanFrameVerifiedBy = transitionId;
    }
    return { frame, result: 'applied' };
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
    this.#markedFrame = null;
    this.#cleanFrameVerifiedBy = null;
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
    if (this.#requiresFrameVerification && this.#cleanFrameVerifiedBy !== transitionId) {
      throw new Error('Viewport output cannot resume before a clean source frame is verified');
    }
    const verifiedSourceSize = this.#markedFrame?.sourceSize ?? null;
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
    this.#verifiedSourceSize = verifiedSourceSize;
    this.#markedFrame = null;
    this.#cleanFrameVerifiedBy = null;
    return 'applied';
  }
}

export function createCropFrameGate(params: CropFrameGateParams): CropFrameGate {
  return new CropFrameGateController(params);
}
