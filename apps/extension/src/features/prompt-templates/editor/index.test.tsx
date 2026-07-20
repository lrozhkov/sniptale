// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  contentMock: vi.fn(),
  useStateMock: vi.fn(() => ({ mode: 'edit' })),
}));

vi.mock('./content', () => ({
  PromptTemplateEditorContent: (props: any) => {
    mocks.contentMock(props);
    return <div data-testid="content">content</div>;
  },
}));

vi.mock('./use-state', () => ({
  usePromptTemplateEditorState: mocks.useStateMock,
}));

import { PromptTemplateEditor } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

describe('PromptTemplateEditor', () => {
  it('returns null when closed and renders content when open', () => {
    render(<PromptTemplateEditor isOpen={false} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(container?.textContent).toBe('');

    render(
      <PromptTemplateEditor
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn()}
        template={{ content: 'body', name: 'Template' }}
      />
    );
    expect(mocks.contentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        state: { mode: 'edit' },
        template: { content: 'body', name: 'Template' },
      })
    );
  });
});
