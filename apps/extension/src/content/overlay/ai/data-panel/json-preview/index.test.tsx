// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { bodyMock, headerMock } = vi.hoisted(() => ({
  bodyMock: vi.fn((_props: unknown) => <div data-testid="body" />),
  headerMock: vi.fn((_props: unknown) => <div data-testid="header" />),
}));

vi.mock('./header', () => ({
  JsonPreviewHeader: (props: unknown) => {
    headerMock(props);
    return <div data-testid="header" />;
  },
}));

vi.mock('./body', () => ({
  JsonPreviewBody: (props: unknown) => {
    bodyMock(props);
    return <div data-testid="body" />;
  },
}));

import { JsonPreview } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps() {
  return {
    copied: false,
    copyFormattedJson: vi.fn(),
    formattedJSON: '{"ok":true}',
    handleJsonResizeStart: vi.fn(),
    isJsonResizing: false,
    isLoading: false,
    jsonPreviewRef: { current: null },
    setShowDataPreview: vi.fn(),
    showDataPreview: true,
  };
}

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
  bodyMock.mockClear();
  headerMock.mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('JsonPreview', () => {
  it('passes props to the header and visible body owners', async () => {
    const props = createProps();

    await renderNode(<JsonPreview {...props} />);

    expect(headerMock).toHaveBeenCalledWith({
      copied: props.copied,
      copyFormattedJson: props.copyFormattedJson,
      formattedJSON: props.formattedJSON,
      isLoading: props.isLoading,
      setShowDataPreview: props.setShowDataPreview,
      showDataPreview: props.showDataPreview,
    });
    expect(bodyMock).toHaveBeenCalledWith({
      formattedJSON: props.formattedJSON,
      handleJsonResizeStart: props.handleJsonResizeStart,
      isJsonResizing: props.isJsonResizing,
      jsonPreviewRef: props.jsonPreviewRef,
    });
  });

  it('skips body rendering when preview is hidden or json is empty', async () => {
    const props = createProps();
    props.showDataPreview = false;
    props.formattedJSON = '';

    await renderNode(<JsonPreview {...props} />);

    expect(headerMock).toHaveBeenCalledOnce();
    expect(bodyMock).not.toHaveBeenCalled();
  });
});
