// @vitest-environment jsdom

import { act } from 'react';
import type React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { renderTextAlignSection, renderTextVerticalAlignSection } from './layout';
import type { TextControlsProps, TextSettings } from './types';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderNode(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<>{node}</>));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

it('renders text alignment rows with provided labels and fallback labels', () => {
  const applyTextPatch = vi.fn();
  const settings = { textAlign: 'left', verticalAlign: 'top' } as TextSettings;
  const props = {
    applyTextPatch,
    textAlignOptions: [{ value: 'center', label: 'Centered' }],
    textVerticalAlignOptions: [{ value: 'bottom', label: 'Bottom edge' }],
  } as unknown as TextControlsProps;

  renderNode(
    <>
      {renderTextAlignSection(props, settings)}
      {renderTextVerticalAlignSection(props, settings)}
    </>
  );

  expect(container?.querySelector('button[aria-label="Centered"]')).not.toBeNull();
  expect(
    container?.querySelector('button[aria-label="editor.compact.textAlignLeft"]')
  ).not.toBeNull();
  expect(container?.querySelector('button[aria-label="Bottom edge"]')).not.toBeNull();
  expect(
    container?.querySelector('button[aria-label="editor.compact.verticalAlignTop"]')
  ).not.toBeNull();

  act(() => {
    container?.querySelector<HTMLButtonElement>('button[aria-label="Centered"]')?.click();
    container?.querySelector<HTMLButtonElement>('button[aria-label="Bottom edge"]')?.click();
  });

  expect(applyTextPatch).toHaveBeenCalledWith({ textAlign: 'center' });
  expect(applyTextPatch).toHaveBeenCalledWith({ verticalAlign: 'bottom' });
});
