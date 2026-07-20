// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PromptTemplate } from '../../../../../contracts/settings';
import { useTemplateDeleteActions } from './delete';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useTemplateDeleteActions> | null = null;

const template = {
  content: 'one',
  id: 'template-1',
  name: 'One',
} as PromptTemplate;

function DeleteActionsHarness() {
  latestState = useTemplateDeleteActions();
  return null;
}

async function renderHarness() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<DeleteActionsHarness />);
  });
}

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
});

describe('useTemplateDeleteActions', () => {
  it('opens confirm state, confirms deletion, and resets state', async () => {
    const setOpenMenuId = vi.fn();
    const onDeleteTemplate = vi.fn();

    await renderHarness();

    act(() => {
      latestState?.handleDeleteTemplate(template, setOpenMenuId);
    });

    expect(setOpenMenuId).toHaveBeenCalledWith(null);
    expect(latestState?.confirmState).toEqual({ isOpen: true, template });

    await act(async () => {
      await latestState?.confirmDelete(onDeleteTemplate);
    });

    expect(onDeleteTemplate).toHaveBeenCalledWith(template);
    expect(latestState?.confirmState).toEqual({ isOpen: false, template: null });
  });

  it('cancels and ignores confirm requests when no template is pending', async () => {
    const onDeleteTemplate = vi.fn();

    await renderHarness();

    await act(async () => {
      await latestState?.confirmDelete(onDeleteTemplate);
      latestState?.cancelDelete();
    });

    expect(onDeleteTemplate).not.toHaveBeenCalled();
    expect(latestState?.confirmState).toEqual({ isOpen: false, template: null });
  });
});
