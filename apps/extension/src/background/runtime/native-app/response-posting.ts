import type { NativeAppOutboundMessage } from '../../../contracts/native-app';

export function postNativeResponses(
  responses: NativeAppOutboundMessage[] | Promise<NativeAppOutboundMessage[]>,
  post: (message: NativeAppOutboundMessage) => void,
  warn: (message: string) => void
): void {
  void Promise.resolve(responses).then(
    (messages) => {
      for (const message of messages) {
        post(message);
      }
    },
    () => {
      warn('Native response failed');
    }
  );
}
