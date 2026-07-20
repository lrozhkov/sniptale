import type { TabPageStyleRequestByType, TabPageStyleResponseByType } from './page-style';
import type { TabUiRequestByType, TabUiResponseByType } from './ui';
import type { TabVideoRequestByType, TabVideoResponseByType } from './video';

export type TabRequestByType = TabUiRequestByType &
  TabVideoRequestByType &
  TabPageStyleRequestByType;
export type TabResponseByType = TabUiResponseByType &
  TabVideoResponseByType &
  TabPageStyleResponseByType;

export type TabMessageType = Extract<keyof TabRequestByType, string>;
