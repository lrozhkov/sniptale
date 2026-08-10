import { expect, it, vi } from 'vitest';

const completeDrawWorkflowFromBindings = vi.hoisted(() => vi.fn(() => true));
vi.mock('./draw-completion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./draw-completion')>()),
  completeDrawWorkflowFromBindings,
}));

import { completeDrawSessionOnEnterFromBindings } from './draw-session-completion';

it('delegates Enter completion to the shared draw workflow', () => {
  const bindings = { id: 'bindings' };
  expect(Reflect.apply(completeDrawSessionOnEnterFromBindings, null, [bindings])).toBe(true);
  expect(completeDrawWorkflowFromBindings).toHaveBeenCalledWith(bindings);
});
