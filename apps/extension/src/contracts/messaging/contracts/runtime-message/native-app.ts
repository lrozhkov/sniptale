import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  NativeAppMutationMessage,
  NativeAppQueryMessage,
  NativeAppRuntimeResponse,
} from '../../../native-app/runtime';

export type RuntimeNativeAppRequestByType = {
  [MessageType.NATIVE_APP_QUERY]: NativeAppQueryMessage;
  [MessageType.NATIVE_APP_MUTATION]: NativeAppMutationMessage;
};

export type RuntimeNativeAppResponseByType = {
  [MessageType.NATIVE_APP_QUERY]: NativeAppRuntimeResponse;
  [MessageType.NATIVE_APP_MUTATION]: NativeAppRuntimeResponse;
};
