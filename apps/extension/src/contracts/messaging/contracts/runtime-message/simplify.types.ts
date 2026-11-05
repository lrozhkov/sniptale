import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import {
  isImageDataUrl,
  readImageDataUrlDimensions,
} from '@sniptale/runtime-contracts/validation/data-url';
import type { SimplifySettings } from '../../../../features/simplify/settings';

export interface SimplifyComputeRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Clockwise degrees for manual text source projection; omitted means zero. */
  rotation?: number;
}
export type SimplifyCommand =
  | { operation: 'prepare'; dataUrl: string }
  | {
      operation: 'render';
      sessionId: string;
      settings: SimplifySettings;
      region: SimplifyComputeRegion;
    }
  | { operation: 'cancel'; sessionId: string }
  | { operation: 'dispose'; sessionId: string };
export type OffscreenSimplifyCommand = SimplifyCommand & { sessionId: string };
export type SimplifyCompletion =
  | { sessionId: string; width: number; height: number; version: string; dataUrl?: string }
  | { result: 'disposed' };
export type SimplifyResponse = RuntimeMessageResponse<SimplifyCompletion>;
export type RuntimeSimplifyRequestByType = {
  [MessageType.SIMPLIFY_COMMAND]: SimplifyCommand & { type: typeof MessageType.SIMPLIFY_COMMAND };
  [MessageType.OFFSCREEN_SIMPLIFY_COMMAND]: OffscreenSimplifyCommand & {
    type: typeof MessageType.OFFSCREEN_SIMPLIFY_COMMAND;
    capabilityToken: string;
  };
};
export type RuntimeSimplifyResponseByType = {
  [MessageType.SIMPLIFY_COMMAND]: SimplifyResponse;
  [MessageType.OFFSCREEN_SIMPLIFY_COMMAND]: SimplifyResponse;
};

/** Reads bounded PNG dimensions before allocating a decoded raster. */
export function readSimplifyPngDimensions(
  value: unknown
): { width: number; height: number } | null {
  if (!isImageDataUrl(value) || !value.startsWith('data:image/png;base64,')) return null;
  const dimensions = readImageDataUrlDimensions(value);
  return dimensions && dimensions.width * dimensions.height <= 16_777_216 ? dimensions : null;
}
