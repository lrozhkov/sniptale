// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => {
    if (key === 'editor.compact.urlPlaceholder') {
      return 'Enter page URL';
    }

    return key;
  },
  useAppLocale: () => 'en',
}));

import { EditorInspectorBrowserFramePanelContent } from './browser-frame';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const browserFramePanelOptions = {
  browserCanvasModeOptions: [
    { label: 'Resize', value: 'resize' },
    { label: 'Keep size', value: 'keep-size' },
  ],
  browserContentModeOptions: [
    { label: 'Push down', value: 'push-down' },
    { label: 'Fit', value: 'fit-content' },
  ],
} as const;

type TestBrowserFrameState = {
  canvasMode: 'resize' | 'keep-size';
  contentMode: 'push-down' | 'fit-content';
  title: string;
  url: string;
};

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

function createBrowserFramePanelProps(
  browserFrame: TestBrowserFrameState,
  syncBrowserFrame: (updates: unknown) => Promise<void> | void,
  insertOrUpdateBrowserFrame = vi.fn()
) {
  return {
    browserCanvasModeOptions: [...browserFramePanelOptions.browserCanvasModeOptions],
    browserContentModeOptions: [...browserFramePanelOptions.browserContentModeOptions],
    browserFrame,
    insertOrUpdateBrowserFrame,
    syncBrowserFrame,
  };
}

async function renderBrowserFramePanel(
  browserFrame: TestBrowserFrameState,
  syncBrowserFrame = vi.fn(),
  insertOrUpdateBrowserFrame = vi.fn()
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <EditorInspectorBrowserFramePanelContent
        {...createBrowserFramePanelProps(
          browserFrame,
          syncBrowserFrame,
          insertOrUpdateBrowserFrame
        )}
      />
    );
  });

  return { insertOrUpdateBrowserFrame, syncBrowserFrame };
}

function updateInputValue(input: HTMLInputElement | null, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input?.dispatchEvent(new Event('input', { bubbles: true }));
}

function blurInput(input: HTMLInputElement | null) {
  input?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

it('reads the browser-frame URL placeholder from the shared i18n seam and forwards updates', async () => {
  const syncBrowserFrame = vi.fn();
  await renderBrowserFramePanel(
    {
      canvasMode: 'resize',
      contentMode: 'push-down',
      title: '',
      url: '',
    },
    syncBrowserFrame
  );
  const titleInput =
    container?.querySelector<HTMLInputElement>(
      'input[placeholder="editor.compact.pageTitlePlaceholder"]'
    ) ?? null;
  const urlInput =
    container?.querySelector<HTMLInputElement>('input[placeholder="Enter page URL"]') ?? null;

  expect(urlInput).not.toBeNull();
  expect(
    container?.querySelectorAll('[data-ui="shared.ui.compact-inspector.text-field"]')
  ).toHaveLength(2);

  await act(async () => {
    updateInputValue(titleInput, 'Updated title');
    updateInputValue(urlInput, 'https://sniptale.dev');
    blurInput(titleInput);
    blurInput(urlInput);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(syncBrowserFrame).toHaveBeenCalledWith({ title: 'Updated title' });
  expect(syncBrowserFrame).toHaveBeenCalledWith({ url: 'https://sniptale.dev' });
});

it('hides the browser profile section and routes the apply action', async () => {
  const { insertOrUpdateBrowserFrame } = await renderBrowserFramePanel({
    canvasMode: 'resize',
    contentMode: 'push-down',
    title: '',
    url: '',
  });

  await act(async () => {
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button[type="button"]') ?? [])
      .find((button) => button.textContent?.includes('editor.compact.apply'))
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(insertOrUpdateBrowserFrame).toHaveBeenCalledOnce();
  expect(container?.textContent).not.toContain('editor.compact.browserPreset');
  expect(container?.textContent).not.toContain('editor.compact.browserPresetCanonical');
  expect(container?.textContent).not.toContain('editor.compact.browserFrameAction');
});

it('keeps tab title and URL values only inside inputs', async () => {
  await renderBrowserFramePanel({
    canvasMode: 'resize',
    contentMode: 'push-down',
    title: 'Full title',
    url: 'https://sniptale.dev/full/path',
  });

  expect(container?.textContent).not.toContain('Full title');
  expect(container?.textContent).not.toContain('https://sniptale.dev/full/path');
  expect(container?.textContent).toContain('editor.compact.browserTabTitle');
  expect(container?.textContent).toContain('URL');
  expect(
    container?.querySelector<HTMLInputElement>(
      'input[placeholder="editor.compact.pageTitlePlaceholder"]'
    )?.value
  ).toBe('Full title');
  expect(
    container?.querySelector<HTMLInputElement>('input[placeholder="Enter page URL"]')?.value
  ).toBe('https://sniptale.dev/full/path');
});

it('does not render legacy variant or os/theme selectors', async () => {
  await renderBrowserFramePanel({
    canvasMode: 'resize',
    contentMode: 'push-down',
    title: '',
    url: '',
  });

  expect(container?.querySelector('button[aria-label="editor.compact.browserVariant"]')).toBeNull();
  expect(
    container?.querySelector('button[aria-label="editor.compact.browserHeaderTheme"]')
  ).toBeNull();
  expect(
    container?.querySelector('button[aria-label="editor.compact.browserHeaderMode"]')
  ).toBeNull();
  expect(
    container?.querySelector('button[aria-label="editor.compact.browserAppearance"]')
  ).toBeNull();
});

it('always renders header title and url controls for the insert/update flow', async () => {
  const markup = renderToStaticMarkup(
    <EditorInspectorBrowserFramePanelContent
      browserCanvasModeOptions={[]}
      browserContentModeOptions={[]}
      browserFrame={{
        canvasMode: 'resize',
        contentMode: 'push-down',
        title: '',
        url: '',
      }}
      insertOrUpdateBrowserFrame={vi.fn()}
      syncBrowserFrame={vi.fn()}
    />
  );

  expect(markup).toContain('Enter page URL');
});

it('uses a no-op insert action when the browser frame owner omits it', async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <EditorInspectorBrowserFramePanelContent
        browserCanvasModeOptions={[]}
        browserContentModeOptions={[]}
        browserFrame={{
          canvasMode: 'resize',
          contentMode: 'push-down',
          title: '',
          url: '',
        }}
        syncBrowserFrame={vi.fn()}
      />
    );
  });

  await act(async () => {
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button[type="button"]') ?? [])
      .find((button) => button.textContent?.includes('editor.compact.apply'))
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(container?.textContent).toContain('editor.compact.apply');
});
