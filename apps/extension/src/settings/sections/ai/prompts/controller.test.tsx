// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const query = vi.hoisted(() => vi.fn());
vi.mock('../../../../workflows/ai-settings/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../workflows/ai-settings/query')>()),
  requestAISettingsPageRuntimeData: query,
}));
vi.mock('./state', () => ({ useAiProvidersPromptState: (source: unknown) => source }));
import { useAiPromptsController } from './controller';
it('loads prompt values into an independent prompt-page state owner', async () => {
  query.mockResolvedValue({
    selectionBootstrap: { globalSystemPrompt: 'global' },
    scenarioEditorSystemPrompt: 'scenario',
  });
  let latest: ReturnType<typeof useAiPromptsController> | undefined;
  function Harness() {
    latest = useAiPromptsController();
    return null;
  }
  const node = document.createElement('div');
  const root = createRoot(node);
  await act(async () => {
    root.render(<Harness />);
    await Promise.resolve();
  });
  expect(latest?.isLoading).toBe(false);
  expect(latest?.prompts).toMatchObject({
    globalPrompt: 'global',
    scenarioEditorPrompt: 'scenario',
  });
  act(() => root.unmount());
});

it('surfaces load failures without applying stale results after unmount', async () => {
  let rejectRequest: ((error: Error) => void) | undefined;
  query.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectRequest = reject;
      })
  );
  let latest: ReturnType<typeof useAiPromptsController> | undefined;
  function Harness() {
    latest = useAiPromptsController();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness />));
  expect(latest?.isLoading).toBe(true);
  await act(async () => rejectRequest?.(new Error('failed')));
  expect(latest).toMatchObject({ error: true, isLoading: false });
  act(() => root.unmount());

  let resolveRequest: ((value: unknown) => void) | undefined;
  query.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
  );
  const detachedRoot = createRoot(document.createElement('div'));
  act(() => detachedRoot.render(<Harness />));
  act(() => detachedRoot.unmount());
  await act(async () =>
    resolveRequest?.({
      selectionBootstrap: { globalSystemPrompt: 'stale' },
      scenarioEditorSystemPrompt: 'stale',
    })
  );
});
