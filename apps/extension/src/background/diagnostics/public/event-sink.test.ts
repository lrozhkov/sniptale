import { expect, it, vi } from 'vitest';

const { handleEventFromContentScript } = vi.hoisted(() => ({
  handleEventFromContentScript: vi.fn(),
}));

vi.mock('../handlers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../handlers')>()),
  handleEventFromContentScript,
}));

import { appendContentDiagnosticEvent } from './event-sink';

it('delegates content events to the diagnostics session owner', () => {
  const event = { kind: 'action' as const, message: 'clicked' };

  appendContentDiagnosticEvent(event, 42);

  expect(handleEventFromContentScript).toHaveBeenCalledWith(event, 42);
});
