export interface ClarkModel {
  readonly blocks: number;
  readonly bytes: number;
  readonly channels: number;
  readonly colorMode: string;
  readonly id: string;
  readonly scale: number;
  readonly sha256: string;
  readonly url: string;
}
export interface ClarkBackend {
  readonly ready: boolean;
  readonly unavailable: boolean;
  enhance(source: VideoFrame): Promise<HTMLCanvasElement | null>;
  destroy(): void;
}
export const REALTIME_VIDEO_MODEL: Readonly<ClarkModel>;
export function realtimeVideoIsEligible(options: {
  enabled?: boolean;
  height: number;
  kind: string;
  width: number;
}): boolean;
export function createRealtimeVideoUpscaler(options: {
  height: number;
  width: number;
  model?: ClarkModel;
}): Promise<ClarkBackend | null>;
