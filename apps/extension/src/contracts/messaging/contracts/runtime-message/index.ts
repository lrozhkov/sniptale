import type { RuntimeCoreRequestByType, RuntimeCoreResponseByType } from './core';
import type { RuntimeNativeAppRequestByType, RuntimeNativeAppResponseByType } from './native-app';
import type {
  VoiceInputRuntimeRequestByType,
  VoiceInputRuntimeResponseByType,
} from '@sniptale/runtime-contracts/voice-input';
import type { RuntimeVideoRequestByType, RuntimeVideoResponseByType } from '../../video/runtime';

export type RuntimeRequestByType = RuntimeCoreRequestByType &
  RuntimeNativeAppRequestByType &
  RuntimeVideoRequestByType &
  VoiceInputRuntimeRequestByType;
export type RuntimeResponseByType = RuntimeCoreResponseByType &
  RuntimeNativeAppResponseByType &
  RuntimeVideoResponseByType &
  VoiceInputRuntimeResponseByType;

export type RuntimeMessageType = Extract<keyof RuntimeRequestByType, string>;
