// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderColorControl(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(node);
  });
}

async function renderGridColorControl(props: {
  value?: string;
  onChange?: (value: string) => void;
}) {
  const { EditorColorControl } = await import('./');

  await renderColorControl(
    <EditorColorControl
      title="Grid color"
      label="Grid color"
      value={props.value ?? '#123456'}
      recentColors={['#654321']}
      palette={['#abcdef']}
      onChange={props.onChange ?? (() => undefined)}
    />
  );
}

function cleanupColorControlDom() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
}

function queryButton(label: string) {
  return Array.from(document.body.querySelectorAll('button') ?? []).find(
    (button) => button.textContent?.includes(label) || button.getAttribute('aria-label') === label
  ) as HTMLButtonElement | undefined;
}

async function clickButton(label: string) {
  await act(async () => {
    queryButton(label)?.click();
  });
}

describe('editor-color-control', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    cleanupColorControlDom();
  });

  afterEach(() => {
    cleanupColorControlDom();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the editor facade wired to the shared compact trigger contract', async () => {
    await renderGridColorControl({});

    expect(container?.textContent).toContain('#123456'.toUpperCase());
    expect(container?.textContent).not.toContain('shared.ui.colorSelectorTransparent');
    expect(container?.textContent).not.toContain('Grid color');

    await clickButton('Grid color');

    expect(document.body.textContent).toContain('shared.ui.colorSelectorRecentColors');
    expect(document.body.textContent).toContain('shared.ui.colorSelectorPalette');
  });
});
