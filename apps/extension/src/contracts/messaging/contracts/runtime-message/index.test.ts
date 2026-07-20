import { expectTypeOf, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { NativeAppQueryMessage, NativeAppRuntimeResponse } from '../../../native-app/runtime';
import type { RuntimeMessageType, RuntimeRequestByType, RuntimeResponseByType } from './index';

it('includes native app routes in the unified runtime message map', () => {
  expectTypeOf<RuntimeMessageType>().toMatchTypeOf<string>();
  expectTypeOf<
    RuntimeRequestByType[typeof MessageType.NATIVE_APP_QUERY]
  >().toEqualTypeOf<NativeAppQueryMessage>();
  expectTypeOf<
    RuntimeResponseByType[typeof MessageType.NATIVE_APP_QUERY]
  >().toEqualTypeOf<NativeAppRuntimeResponse>();
});
