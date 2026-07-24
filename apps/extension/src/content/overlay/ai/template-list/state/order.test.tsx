// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptTemplate } from '../../../../../contracts/settings';

const { loadTemplateOrderMock, saveTemplateOrderMock } = vi.hoisted(() => ({
  loadTemplateOrderMock: vi.fn(),
  saveTemplateOrderMock: vi.fn(),
}));

vi.mock('../../../../../composition/persistence/prompt-templates', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../composition/persistence/prompt-templates')
  >()),
  loadTemplateOrder: loadTemplateOrderMock,
  saveTemplateOrder: saveTemplateOrderMock,
}));

import { useTemplateOrderState } from './order';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestOrderState: ReturnType<typeof useTemplateOrderState> | null = null;

const templates = [{ content: 'one', id: 'template-1', name: 'One' }] as PromptTemplate[];

function OrderStateHarness(props: { templates: PromptTemplate[] }) {
  latestOrderState = useTemplateOrderState(props.templates);
  return null;
}

async function renderHarness(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(node);
    await Promise.resolve();
  });
}

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  latestOrderState = null;
  loadTemplateOrderMock.mockReset();
  loadTemplateOrderMock.mockResolvedValue(['template-1']);
  saveTemplateOrderMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('useTemplateOrderState', () => {
  it('loads saved order once and syncs it against current templates after bootstrap', async () => {
    await renderHarness(<OrderStateHarness templates={templates} />);

    expect(loadTemplateOrderMock).toHaveBeenCalledTimes(1);
    expect(latestOrderState?.orderedIds).toEqual(['template-1']);
  });

  it('preserves existing ids and appends newly available templates', async () => {
    loadTemplateOrderMock.mockResolvedValueOnce(['template-2', 'missing', 'template-1']);
    const availableTemplates = [
      { content: 'one', id: 'template-1', name: 'One' },
      { content: 'two', id: 'template-2', name: 'Two' },
      { content: 'three', id: 'template-3', name: 'Three' },
    ] satisfies PromptTemplate[];

    await renderHarness(<OrderStateHarness templates={availableTemplates} />);

    expect(latestOrderState?.orderedIds).toEqual(['template-2', 'template-1', 'template-3']);
  });

  it('keeps the reordered local ids even if advisory persistence later rejects', async () => {
    saveTemplateOrderMock.mockRejectedValueOnce(new Error('storage offline'));
    const reorderTemplates = [
      { content: 'one', id: 'template-1', name: 'One' },
      { content: 'two', id: 'template-2', name: 'Two' },
    ] satisfies PromptTemplate[];
    loadTemplateOrderMock.mockResolvedValueOnce(['template-1', 'template-2']);
    await renderHarness(<OrderStateHarness templates={reorderTemplates} />);

    act(() => {
      latestOrderState?.reorder('template-1', 'template-2');
    });
    await saveTemplateOrderMock.mock.results[0]?.value?.catch(() => undefined);

    expect(latestOrderState?.orderedIds).toEqual(['template-2', 'template-1']);
    expect(saveTemplateOrderMock).toHaveBeenCalledWith(['template-2', 'template-1']);
  });
});
