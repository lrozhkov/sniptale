/**
 * Shared Native Messaging adapter. Product policy, host selection, and protocol handling live in
 * background native-app owners.
 */
interface BrowserNativeMessagingAdapter {
  connectNative(application: string): chrome.runtime.Port;
}

export const browserNativeMessaging: BrowserNativeMessagingAdapter = {
  connectNative(application) {
    return chrome.runtime.connectNative(application);
  },
};
