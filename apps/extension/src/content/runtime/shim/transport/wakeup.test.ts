import { expect, it, vi } from 'vitest';
import { wakeContentRuntimeFromShim } from './wakeup';

it('sends content runtime wake-up through the compact browser adapter', async () => {
  const sendRuntimeMessage = vi.fn().mockResolvedValue({ restored: false, success: true });

  await expect(wakeContentRuntimeFromShim({ sendRuntimeMessage })).resolves.toEqual({
    restored: false,
    success: true,
  });

  expect(sendRuntimeMessage).toHaveBeenCalledOnce();
  expect(sendRuntimeMessage).toHaveBeenCalledWith({ type: 'CONTENT_RUNTIME_WAKEUP' });
});
