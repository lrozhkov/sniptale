// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptTemplate } from '../../../../../contracts/settings';

const {
  findTemplateIdUnderPointMock,
  useTemplateDeleteActionsMock,
  useTemplateDragStateMock,
  useTemplateListDerivedStateMock,
  useTemplateMenuDismissMock,
  useTemplateOrderStateMock,
} = vi.hoisted(() => ({
  findTemplateIdUnderPointMock: vi.fn(() => 'template-hit'),
  useTemplateDeleteActionsMock: vi.fn(),
  useTemplateDragStateMock: vi.fn(),
  useTemplateListDerivedStateMock: vi.fn(),
  useTemplateMenuDismissMock: vi.fn(),
  useTemplateOrderStateMock: vi.fn(),
}));

vi.mock('../drag/targets', () => ({
  findTemplateIdUnderPoint: findTemplateIdUnderPointMock,
}));

vi.mock('../drag', () => ({
  useTemplateDragState: useTemplateDragStateMock,
}));

vi.mock('./hooks', () => ({
  useTemplateDeleteActions: useTemplateDeleteActionsMock,
  useTemplateListDerivedState: useTemplateListDerivedStateMock,
  useTemplateMenuDismiss: useTemplateMenuDismissMock,
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
  findTemplateIdUnderPointMock.mockReset();
  findTemplateIdUnderPointMock.mockReturnValue('template-hit');
  useTemplateMenuDismissMock.mockReset();
  useTemplateOrderStateMock.mockReset();
  useTemplateOrderStateMock.mockReturnValue({
    orderedIds: ['template-1'],
    setOrderedIds: vi.fn(),
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
  it('delegates pill hit-testing to the canonical target owner and exposes drag state', async () => {
    await renderHarness({ templates });

    const dragArgs = useTemplateDragStateMock.mock.calls[0];
    const findIdUnderPoint = dragArgs?.[0] as ((x: number, y: number) => string | null) | undefined;

    if (!findIdUnderPoint || !latestState) {
      throw new Error('Expected template-list state to initialize');
    }

    const pill = document.createElement('div');
    latestState.pillRefs.current.set('template-1', pill);

    expect(findIdUnderPoint(20, 30)).toBe('template-hit');
    expect(findTemplateIdUnderPointMock).toHaveBeenCalledWith(latestState.pillRefs.current, 20, 30);
    expect(latestState.draggedId).toBe('template-dragged');
    expect(latestState.dragOverId).toBe('template-over');
  });
});
