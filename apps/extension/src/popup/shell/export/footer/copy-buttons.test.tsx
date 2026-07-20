// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExportFooterCopyButtons } from './copy-buttons';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(overrides: Partial<Parameters<typeof ExportFooterCopyButtons>[0]> = {}) {
  return {
    canCopyJson: true,
    canCopyMarkdown: true,
    copyJsonTitle: 'Copy JSON current tab',
    copyMarkdownTitle: 'Copy Markdown current tab',
    copiedFormat: null,
    onCopyJson: vi.fn(),
    onCopyMarkdown: vi.fn(),
    ...overrides,
  };
}

async function renderButtons(props: ReturnType<typeof createProps>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ExportFooterCopyButtons {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('ExportFooterCopyButtons', () => {
  it('renders both copy buttons with current-tab hints and forwards clicks', async () => {
    const props = createProps();

    await renderButtons(props);

    const buttons = container?.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons?.[0]?.getAttribute('title')).toBe('Copy JSON current tab');
    expect(buttons?.[1]?.getAttribute('title')).toBe('Copy Markdown current tab');

    await act(async () => {
      buttons?.[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons?.[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(props.onCopyJson).toHaveBeenCalledTimes(1);
    expect(props.onCopyMarkdown).toHaveBeenCalledTimes(1);
  });

  it('marks the copied format and disables unavailable copy actions', async () => {
    await renderButtons(
      createProps({
        canCopyMarkdown: false,
        copiedFormat: 'json',
      })
    );

    const buttons = container?.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    expect(
      buttons?.[0]?.querySelector('.text-\\[var\\(--sniptale-color-success\\)\\]')
    ).not.toBeNull();
    expect(buttons?.[1]?.disabled).toBe(true);
  });
});
