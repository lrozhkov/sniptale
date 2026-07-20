// @vitest-environment jsdom

import { act } from 'react';
import type React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

const { estimateTokensMock, selectLastPromptMock, setLastPromptMock, usePromptTemplatesMock } =
  vi.hoisted(() => ({
    estimateTokensMock: vi.fn((value: string) => value.length),
    selectLastPromptMock: vi.fn(),
    setLastPromptMock: vi.fn(),
    usePromptTemplatesMock: vi.fn(),
  }));

vi.mock('../../../../parser/dom-tree-parser/ai/format', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../parser/dom-tree-parser/ai/format')
  >('../../../../parser/dom-tree-parser/ai/format');

  return {
    ...actual,
    estimateTokens: estimateTokensMock,
  };
});

vi.mock('./prompt-template-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./prompt-template-state')>()),
  usePromptTemplates: usePromptTemplatesMock,
}));

vi.mock('../../../state/ai-modal.store', () => ({
  selectLastPrompt: selectLastPromptMock,
  useAIModalStore: (
    selector: (state: { lastPrompt: string; setLastPrompt: typeof setLastPromptMock }) => unknown
  ) =>
    selector({
      lastPrompt: 'stored prompt',
      setLastPrompt: setLastPromptMock,
    }),
}));

import { useAIModalCoreState } from './core-state';
import { useAIModalDataPanelState } from '../../data-panel/session/controller';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useAIModalCoreState> | null = null;

const sampleTreeData = {
  context: 'Issue details',
  title: 'AI picker',
  structure: [
    {
      children: [
        {
          headers: ['Name', 'Role'],
          rows: [
            {
              data: {
                Name: 'Alice',
                Role: 'Owner',
              },
              id: 'row-1',
              selected: false,
              selector: '[data-row="1"]',
            },
          ],
          id: 'table-1',
          selected: true,
          type: 'table',
        },
      ],
      id: 'section-1',
      selected: true,
      title: 'Section',
      type: 'section',
    },
  ],
} as unknown as ParsedDOMTree;

function CoreStateHarness() {
  latestState = useAIModalCoreState();
  return null;
}

function CoreStateDataPanelHarness() {
  latestState = useAIModalCoreState();
  const state = useAIModalDataPanelState({
    onSelectedDataChange: latestState.setSelectedData,
    selectedData: latestState.selectedData,
    treeData: sampleTreeData,
  });

  return (
    <button type="button" id="toggle-row-selection" onClick={() => state.toggleSelected('row-1')} />
  );
}

async function renderElement(element: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  usePromptTemplatesMock.mockReturnValue({
    addTemplate: vi.fn(async () => undefined),
    isLoading: false,
    removeTemplate: vi.fn(async () => undefined),
    selectTemplate: vi.fn(async () => 'Template content'),
    templates: [{ content: 'Template content', id: 'template-1', name: 'Template 1' }],
    updateTemplate: vi.fn(async () => undefined),
  });

  await act(async () => {
    root?.render(element);
  });
}

async function renderHarness() {
  await renderElement(<CoreStateHarness />);
}

function getState() {
  if (!latestState) {
    throw new Error('Expected AI modal core state');
  }

  return latestState;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  estimateTokensMock.mockClear();
  selectLastPromptMock.mockImplementation((state: { lastPrompt: string }) => state.lastPrompt);
  setLastPromptMock.mockClear();
  usePromptTemplatesMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.unstubAllGlobals();
});

describe('useAIModalCoreState state assembly', () => {
  it('assembles editor, settings, resize, store, and templates state into one local owner seam', async () => {
    await renderHarness();

    expect(getState().templatesState.templates).toHaveLength(1);
    expect(getState().settings.availableModels).toEqual([]);
    expect(getState().settings.globalSystemPrompt).toBe('');
    expect(getState().settings.selectedModelId).toBeNull();
    expect(getState().lastPrompt).toBe('stored prompt');
    expect(getState().totalTokens).toBe('stored prompt'.length);
  });

  it('hydrates the prompt from session state on first render and remembers prompt edits', async () => {
    await renderHarness();

    expect(getState().prompt).toBe('stored prompt');

    act(() => {
      getState().setPrompt('Updated prompt');
    });

    expect(getState().prompt).toBe('Updated prompt');
    expect(setLastPromptMock).toHaveBeenLastCalledWith('Updated prompt');
  });
});

describe('useAIModalCoreState token accounting', () => {
  it('recomputes total tokens when prompt and selected data change', async () => {
    await renderHarness();

    act(() => {
      getState().setPrompt('prompt');
      getState().setSelectedData('json');
    });

    expect(getState().totalTokens).toBe(10);
    expect(estimateTokensMock).toHaveBeenNthCalledWith(4, 'prompt');
    expect(estimateTokensMock).toHaveBeenNthCalledWith(5, 'json');
    expect(estimateTokensMock).toHaveBeenNthCalledWith(6, '');
  });

  it('recomputes total tokens when table-row selection changes the selected payload', async () => {
    await renderElement(<CoreStateDataPanelHarness />);

    const initialTotalTokens = getState().totalTokens;

    act(() => {
      container
        ?.querySelector<HTMLButtonElement>('#toggle-row-selection')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(getState().totalTokens).toBeGreaterThan(initialTotalTokens);
  });
});
