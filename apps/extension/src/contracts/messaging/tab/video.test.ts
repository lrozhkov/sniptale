import { expectTypeOf, it } from 'vitest';
import {
  RegionCaptureControlMessageType,
  VideoMessageType,
} from '@sniptale/runtime-contracts/video/messages';
import type { RegionCaptureSupportResponse } from '../contracts/types';
import type { TabVideoRequestByType, TabVideoResponseByType } from './video';

it('binds tab-video diagnostic and region-capture contracts to canonical message identifiers', () => {
  expectTypeOf<
    TabVideoRequestByType[VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER]['type']
  >().toEqualTypeOf<VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER>();
  expectTypeOf<
    TabVideoRequestByType[VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER]['type']
  >().toEqualTypeOf<VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER>();
  expectTypeOf<
    TabVideoRequestByType[typeof RegionCaptureControlMessageType.START]['type']
  >().toEqualTypeOf<typeof RegionCaptureControlMessageType.START>();
  expectTypeOf<
    TabVideoRequestByType[typeof RegionCaptureControlMessageType.STOP]['type']
  >().toEqualTypeOf<typeof RegionCaptureControlMessageType.STOP>();
  expectTypeOf<
    TabVideoRequestByType[typeof RegionCaptureControlMessageType.CHECK_SUPPORT]['type']
  >().toEqualTypeOf<typeof RegionCaptureControlMessageType.CHECK_SUPPORT>();
  expectTypeOf<
    TabVideoResponseByType[typeof RegionCaptureControlMessageType.CHECK_SUPPORT]
  >().toMatchTypeOf<RegionCaptureSupportResponse>();
});
