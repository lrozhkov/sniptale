import { expectTypeOf, it } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { TabVideoRequestByType } from './video';

it('binds tab-video diagnostic contracts to canonical message identifiers', () => {
  expectTypeOf<
    TabVideoRequestByType[VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER]['type']
  >().toEqualTypeOf<VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER>();
  expectTypeOf<
    TabVideoRequestByType[VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER]['type']
  >().toEqualTypeOf<VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER>();
});
