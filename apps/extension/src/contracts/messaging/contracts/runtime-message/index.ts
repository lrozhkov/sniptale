import type { RuntimeCoreRequestByType, RuntimeCoreResponseByType } from './core';
import type { RuntimeNativeAppRequestByType, RuntimeNativeAppResponseByType } from './native-app';
import type { RuntimeVideoRequestByType, RuntimeVideoResponseByType } from '../../video/runtime';

export type RuntimeRequestByType = RuntimeCoreRequestByType &
  RuntimeNativeAppRequestByType &
  RuntimeVideoRequestByType;
export type RuntimeResponseByType = RuntimeCoreResponseByType &
  RuntimeNativeAppResponseByType &
  RuntimeVideoResponseByType;

export type RuntimeMessageType = Extract<keyof RuntimeRequestByType, string>;
