import type { TabPageStyleRequestByType, TabPageStyleResponseByType } from './page-style';
import type { TabUiRequestByType, TabUiResponseByType } from './ui';
import type { TabVideoRequestByType, TabVideoResponseByType } from './video';
import type {
  TabFullPageCaptureRequestByType,
  TabFullPageCaptureResponseByType,
} from './full-page-capture';

export type TabRequestByType = TabUiRequestByType &
  TabVideoRequestByType &
  TabPageStyleRequestByType &
  TabFullPageCaptureRequestByType;
export type TabResponseByType = TabUiResponseByType &
  TabVideoResponseByType &
  TabPageStyleResponseByType &
  TabFullPageCaptureResponseByType;

export type TabMessageType = Extract<keyof TabRequestByType, string>;
