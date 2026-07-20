import { expect, it, vi } from 'vitest';

const { registerBackgroundRuntimeMessageListenerFromOwner } = vi.hoisted(() => ({
  registerBackgroundRuntimeMessageListenerFromOwner: vi.fn(),
}));

vi.mock('./boundary/listener', () => ({
  registerBackgroundRuntimeMessageListener: registerBackgroundRuntimeMessageListenerFromOwner,
}));

import { registerBackgroundRuntimeMessageListener } from './boundary/listener';

it('re-exports the runtime-messaging entrypoint from the owner folder without wrapping it', () => {
  expect(registerBackgroundRuntimeMessageListener).toBe(
    registerBackgroundRuntimeMessageListenerFromOwner
  );
});
