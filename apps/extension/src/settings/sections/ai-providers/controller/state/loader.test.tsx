import { expect, it, vi } from 'vitest';
import {
  applyLoadedAiProvidersRuntimeData,
  ensureDefaultAiProvidersModel,
  useAiProvidersLoader,
} from './loader';

vi.mock('./loader/apply-loaded-data', () => ({
  applyLoadedAiProvidersRuntimeData: vi.fn(),
}));

vi.mock('./loader/default-model', () => ({
  ensureDefaultAiProvidersModel: vi.fn(),
}));

vi.mock('./loader/use-loader', () => ({
  useAiProvidersLoader: vi.fn(),
}));

it('re-exports the ai providers loader facade without wrapping', () => {
  expect(applyLoadedAiProvidersRuntimeData).toBeTypeOf('function');
  expect(ensureDefaultAiProvidersModel).toBeTypeOf('function');
  expect(useAiProvidersLoader).toBeTypeOf('function');
});
