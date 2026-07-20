// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { actionsMock, translateMock } = vi.hoisted(() => ({
  actionsMock: vi.fn((_props: unknown) => <div data-testid="json-actions" />),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: translateMock,
}));

vi.mock('./actions', () => ({
  JsonPreviewActions: (props: unknown) => {
    actionsMock(props);
    return <div data-testid="json-actions" />;
  },
}));

import { JsonPreviewHeader } from './header';

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
  actionsMock.mockClear();
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

describe('JsonPreviewHeader', () => {
  it('renders the label and delegates the json action contract', async () => {
    const copyFormattedJson = vi.fn();
    const setShowDataPreview = vi.fn();

    await renderNode(
      <JsonPreviewHeader
        copied={false}
        copyFormattedJson={copyFormattedJson}
        formattedJSON={'{"ok":true}'}
        isLoading={false}
        setShowDataPreview={setShowDataPreview}
        showDataPreview={true}
      />
    );

    expect(container?.textContent).toContain('aiModal.dataForSendingLabel');
    expect(actionsMock).toHaveBeenCalledWith({
      copied: false,
      copyFormattedJson,
      formattedJSON: '{"ok":true}',
      isLoading: false,
      setShowDataPreview,
      showDataPreview: true,
    });
  });
});

describe('JsonPreviewHeader action visibility', () => {
  it('always mounts the actions owner even when copy stays hidden', async () => {
    const copyFormattedJson = vi.fn();
    const setShowDataPreview = vi.fn();

    await renderNode(
      <JsonPreviewHeader
        copied={false}
        copyFormattedJson={copyFormattedJson}
        formattedJSON=""
        isLoading={false}
        setShowDataPreview={setShowDataPreview}
        showDataPreview={false}
      />
    );

    expect(actionsMock).toHaveBeenCalledWith({
      copied: false,
      copyFormattedJson,
      formattedJSON: '',
      isLoading: false,
      setShowDataPreview,
      showDataPreview: false,
    });
  });
});
