import { expect, it, vi } from 'vitest';
import { useAiProvidersDataState, useAiProvidersLoader } from '.';

vi.mock('./data-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./data-state')>()),
  useAiProvidersDataState: vi.fn(),
}));

vi.mock('./loader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./loader')>()),
  useAiProvidersLoader: vi.fn(),
}));

it('re-exports the ai providers runtime state seam without wrapping', () => {
  expect(useAiProvidersDataState).toBeTypeOf('function');
  expect(useAiProvidersLoader).toBeTypeOf('function');
});
