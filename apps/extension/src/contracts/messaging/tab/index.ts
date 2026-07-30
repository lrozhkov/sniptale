import type { TabUiRequestByType, TabUiResponseByType } from './ui';
import type { TabVideoRequestByType, TabVideoResponseByType } from './video';
import type {
  TabFullPageCaptureRequestByType,
  TabFullPageCaptureResponseByType,
} from './full-page-capture';

export type TabRequestByType = TabUiRequestByType &
  TabVideoRequestByType &
  TabFullPageCaptureRequestByType;
export type TabResponseByType = TabUiResponseByType &
  TabVideoResponseByType &
  TabFullPageCaptureResponseByType;

export type TabMessageType = Extract<keyof TabRequestByType, string>;
