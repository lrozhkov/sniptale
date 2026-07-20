import { expectTypeOf, it } from 'vitest';

import type {
  AppControllerLeaseMessage,
  AppHelloMessage,
  ExtensionControllerAcquireMessage,
  ExtensionPingMessage,
} from './handshake-message-types';
import type {
  NativeAppCapabilities,
  NativeCaptureMode,
  NativeRecordingMode,
} from './platform-types';
import type { NativeEffectiveQualitySettings, NativeTrayActionKind } from './settings-types';
import type { NativeAppError, NativeRecordingStatus } from './status-types';

it('keeps native handshake messages discriminated by direction and purpose', () => {
  expectTypeOf<AppHelloMessage['type']>().toEqualTypeOf<'app.hello'>();
  expectTypeOf<
    ExtensionControllerAcquireMessage['type']
  >().toEqualTypeOf<'extension.controller.acquire'>();
  expectTypeOf<AppControllerLeaseMessage['status']>().toEqualTypeOf<
    'granted' | 'owned-by-other-profile' | 'rejected'
  >();
  expectTypeOf<ExtensionPingMessage>().toMatchTypeOf<{ nonce: string; sentAtEpochMs: number }>();
});

it('keeps native platform, settings, and status restrictions explicit', () => {
  expectTypeOf<Exclude<NativeCaptureMode, NativeRecordingMode>>().toEqualTypeOf<'all-screens'>();
  expectTypeOf<NativeAppCapabilities['codecs']['containers'][number]>().toEqualTypeOf<'mp4'>();
  expectTypeOf<NativeEffectiveQualitySettings['encoder']>().toEqualTypeOf<
    'hardware' | 'software'
  >();
  expectTypeOf<NativeTrayActionKind>().not.toEqualTypeOf<'unknown'>();
  expectTypeOf<NativeRecordingStatus['status']>().not.toEqualTypeOf<'stopped'>();
  expectTypeOf<NativeAppError>().toMatchTypeOf<{ recoverable: boolean }>();
});
