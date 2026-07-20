// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { translateMock } = vi.hoisted(() => ({
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../../../platform/i18n', () => ({
  translate: translateMock,
}));

import { JsonPreviewActions } from './actions';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderNode(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(node);
  });
}

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  translateMock.mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('JsonPreviewActions', () => {
  it('renders toggle and copy actions when preview is visible with data', async () => {
    const copyFormattedJson = vi.fn();
    const setShowDataPreview = vi.fn();

    await renderNode(
      <JsonPreviewActions
        copied={false}
        copyFormattedJson={copyFormattedJson}
        formattedJSON={'{"ok":true}'}
        isLoading={false}
        setShowDataPreview={setShowDataPreview}
        showDataPreview={true}
      />
    );

    const buttons = container?.querySelectorAll<HTMLButtonElement>('button') ?? [];

    act(() => {
      buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(buttons[0]?.getAttribute('title')).toBe('aiModal.hideJsonTitle');
    expect(buttons[0]?.className).toContain('active');
    expect(buttons[1]?.className).toContain('sniptale-copy-btn');
    expect(setShowDataPreview).toHaveBeenCalled();
    expect(copyFormattedJson).toHaveBeenCalled();
  });

  it('omits the copy button when preview is hidden or json is empty', async () => {
    await renderNode(
      <JsonPreviewActions
        copied={false}
        copyFormattedJson={vi.fn()}
        formattedJSON=""
        isLoading={false}
        setShowDataPreview={vi.fn()}
        showDataPreview={false}
      />
    );

    expect(container?.querySelectorAll('button')).toHaveLength(1);
  });
});
