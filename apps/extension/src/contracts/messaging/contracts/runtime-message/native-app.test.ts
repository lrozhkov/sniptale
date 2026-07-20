import { expectTypeOf, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  NativeAppMutationMessage,
  NativeAppQueryMessage,
  NativeAppRuntimeResponse,
} from '../../../native-app/runtime';
import type { RuntimeNativeAppRequestByType, RuntimeNativeAppResponseByType } from './native-app';

it('maps each native app runtime route to its exact request and response contract', () => {
  expectTypeOf<
    RuntimeNativeAppRequestByType[typeof MessageType.NATIVE_APP_QUERY]
  >().toEqualTypeOf<NativeAppQueryMessage>();
  expectTypeOf<
    RuntimeNativeAppRequestByType[typeof MessageType.NATIVE_APP_MUTATION]
  >().toEqualTypeOf<NativeAppMutationMessage>();
  expectTypeOf<
    RuntimeNativeAppResponseByType[typeof MessageType.NATIVE_APP_MUTATION]
  >().toEqualTypeOf<NativeAppRuntimeResponse>();
});
