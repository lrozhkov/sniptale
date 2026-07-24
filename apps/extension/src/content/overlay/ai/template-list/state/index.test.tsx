// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptTemplate } from '../../../../../contracts/settings';

const {
  reorderMock,
  useTemplateDeleteActionsMock,
  useTemplateDragStateMock,
  useTemplateListDerivedStateMock,
  useTemplateMenuDismissMock,
  useTemplateOrderStateMock,
} = vi.hoisted(() => ({
  reorderMock: vi.fn(),
  useTemplateDeleteActionsMock: vi.fn(),
  useTemplateDragStateMock: vi.fn(),
  useTemplateListDerivedStateMock: vi.fn(),
  useTemplateMenuDismissMock: vi.fn(),
  useTemplateOrderStateMock: vi.fn(),
}));

vi.mock('../drag', () => ({
  useTemplateDragState: useTemplateDragStateMock,
}));

vi.mock('./delete', () => ({
  useTemplateDeleteActions: useTemplateDeleteActionsMock,
}));

vi.mock('./derived', () => ({
  useTemplateListDerivedState: useTemplateListDerivedStateMock,
}));

vi.mock('./menu', () => ({
  useTemplateMenuDismiss: useTemplateMenuDismissMock,
}));

vi.mock('./order', () => ({
  useTemplateOrderState: useTemplateOrderStateMock,
}));

import { useTemplateListState } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useTemplateListState> | null = null;

const templates = [{ content: 'one', id: 'template-1', name: 'One' }] as PromptTemplate[];

function TemplateListStateHarness(props: Parameters<typeof useTemplateListState>[0]) {
  latestState = useTemplateListState(props);
  return null;
}

async function renderHarness(props: Parameters<typeof useTemplateListState>[0]) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<TemplateListStateHarness {...props} />);
  });
}

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  latestState = null;
  reorderMock.mockReset();
  useTemplateMenuDismissMock.mockReset();
  useTemplateOrderStateMock.mockReset();
  useTemplateOrderStateMock.mockReturnValue({
    orderedIds: ['template-1'],
    reorder: reorderMock,
  });
  useTemplateListDerivedStateMock.mockReset();
  useTemplateListDerivedStateMock.mockReturnValue({
    hasMore: false,
    orderedTemplates: templates,
    visibleTemplates: templates,
  });
  useTemplateDragStateMock.mockReset();
  useTemplateDragStateMock.mockReturnValue({
    dragOverId: 'template-over',
    draggedId: 'template-dragged',
    dragState: { current: null },
    handlePointerDown: vi.fn(),
  });
  useTemplateDeleteActionsMock.mockReset();
  useTemplateDeleteActionsMock.mockReturnValue({
    cancelDelete: vi.fn(),
    confirmDelete: vi.fn(),
    confirmState: { isOpen: false, template: null },
    handleDeleteTemplate: vi.fn(),
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('useTemplateListState', () => {
  it('composes drag drops through the canonical order owner and exposes drag state', async () => {
    await renderHarness({ templates });

    const dragArgs = useTemplateDragStateMock.mock.calls[0];
    const dragPillRefs = dragArgs?.[0];
    const onDrop = dragArgs?.[1] as ((sourceId: string, targetId: string) => void) | undefined;

    if (!onDrop || !latestState) {
      throw new Error('Expected template-list state to initialize');
    }

    onDrop('template-1', 'template-2');

    expect(dragPillRefs).toBe(latestState.pillRefs);
    expect(reorderMock).toHaveBeenCalledWith('template-1', 'template-2');
    expect(latestState.draggedId).toBe('template-dragged');
    expect(latestState.dragOverId).toBe('template-over');
  });
});
