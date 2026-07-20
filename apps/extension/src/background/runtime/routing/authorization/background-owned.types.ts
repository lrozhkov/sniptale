export type BackgroundOwnedAuthorizationRequest = {
  kind: 'background-owned';
  message: { type: string } & Record<string, unknown>;
  sender: chrome.runtime.MessageSender;
};
