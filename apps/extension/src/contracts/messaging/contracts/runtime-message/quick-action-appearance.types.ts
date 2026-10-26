import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { WindowHeader } from '@sniptale/runtime-contracts/window-header';

export interface QuickActionHeaderRasterInput {
  header: WindowHeader;
  source: { width: number; height: number };
  faviconWebsite?: string;
}
export function isQuickActionHeaderRaster(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 22_369_648 &&
    /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value)
  );
}
export type RuntimeQuickActionAppearanceRequestByType = {
  [MessageType.OFFSCREEN_QUICK_ACTION_HEADER]: QuickActionHeaderRasterInput & {
    type: typeof MessageType.OFFSCREEN_QUICK_ACTION_HEADER;
    capabilityToken: string;
  };
};
export type RuntimeQuickActionAppearanceResponseByType = {
  [MessageType.OFFSCREEN_QUICK_ACTION_HEADER]: RuntimeMessageResponse<{ dataUrl: string }>;
};
