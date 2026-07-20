import { expect, it, vi } from 'vitest';
import {
  buildAiProvidersModelOptions,
  getDeleteTargetId,
  saveAiProvidersDefaultModel,
  saveAiProvidersGlobalPrompt,
  saveAiProvidersScenarioEditorPrompt,
  useAiProvidersDataState,
  useAiProvidersLoader,
  useAiProvidersPromptResize,
} from './runtime';

vi.mock('./model-options', () => ({
  buildAiProvidersModelOptions: vi.fn(),
}));
vi.mock('./delete', () => ({
  getDeleteTargetId: vi.fn(),
}));
vi.mock('./save', () => ({
  saveAiProvidersDefaultModel: vi.fn(),
  saveAiProvidersGlobalPrompt: vi.fn(),
  saveAiProvidersScenarioEditorPrompt: vi.fn(),
}));
vi.mock('./state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state')>()),
  useAiProvidersDataState: vi.fn(),
  useAiProvidersLoader: vi.fn(),
}));
vi.mock('./prompt-resize', () => ({
  useAiProvidersPromptResize: vi.fn(),
}));

it('re-exports the ai-providers runtime seam from owner-local modules without wrapping', () => {
  expect(buildAiProvidersModelOptions).toBeTypeOf('function');
  expect(getDeleteTargetId).toBeTypeOf('function');
  expect(saveAiProvidersDefaultModel).toBeTypeOf('function');
  expect(saveAiProvidersGlobalPrompt).toBeTypeOf('function');
  expect(saveAiProvidersScenarioEditorPrompt).toBeTypeOf('function');
  expect(useAiProvidersDataState).toBeTypeOf('function');
  expect(useAiProvidersLoader).toBeTypeOf('function');
  expect(useAiProvidersPromptResize).toBeTypeOf('function');
});
