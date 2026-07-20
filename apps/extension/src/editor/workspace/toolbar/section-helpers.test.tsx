// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  EditorIconButton: (props: React.PropsWithChildren<Record<string, unknown>>) => (
    <button
      type="button"
      title={String(props['title'])}
      onClick={props['onClick'] as React.MouseEventHandler<HTMLButtonElement>}
      disabled={Boolean(props['disabled'])}
    >
      {props.children}
    </button>
  ),
}));

vi.mock('@sniptale/ui/editor-chrome', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/editor-chrome')>()),
  EDITOR_TOOLBAR_SECTION_CLASS_NAME:
    'flex min-w-0 shrink-0 flex-wrap items-center gap-1.5 px-0.5 sm:flex-nowrap sm:px-1.5',
}));
vi.mock('@sniptale/ui/product-menus/dropdown', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-menus/dropdown')>()),
  ProductDropdownItem: (props: React.PropsWithChildren<Record<string, unknown>>) => (
    <button type="button" onClick={props['onClick'] as React.MouseEventHandler<HTMLButtonElement>}>
      {props.children}
    </button>
  ),
  ProductDropdownMenu: (props: React.PropsWithChildren<Record<string, unknown>>) => (
    <div>{props.children}</div>
  ),
}));

import {
  EditorToolbarInspectorButtons,
  EditorToolbarToolButtons,
  getDocumentRequiredTitle,
} from './section-helpers';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
}

function clickButton(selector: string) {
  act(() => {
    container?.querySelector<HTMLButtonElement>(selector)?.click();
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe('toolbar section helpers', () => {
  it('adds the document-required suffix only when no image is available', () => {
    expect(getDocumentRequiredTitle('Label', true)).toBe('Label');
    expect(getDocumentRequiredTitle('Label', false)).toContain(
      'editor.toolbar.documentRequiredReason'
    );
  });

  it('renders tool and inspector buttons through their owner-local handlers', () => {
    const onActivateTool = vi.fn();
    const onToggleInspector = vi.fn();

    render(
      <>
        <EditorToolbarToolButtons
          hasImage={true}
          isToolButtonActive={() => false}
          onActivateTool={onActivateTool}
        />
        <EditorToolbarInspectorButtons
          activeInspector="tool"
          hasImage={true}
          onToggleInspector={onToggleInspector}
        />
      </>
    );

    clickButton('[title="editor.tools.shapesAndLines"]');
    clickButton('[title="editor.tools.text"]');
    clickButton('[title="editor.toolbar.frame"]');
    clickButton('[title="editor.toolbar.browserFrame"]');
    clickButton('[title="editor.toolbar.meta"]');
    clickButton('[title="editor.toolbar.resize"]');

    expect(onActivateTool).toHaveBeenCalledWith('shapes-and-lines');
    expect(onActivateTool).toHaveBeenCalledWith('text');
    expect(onToggleInspector).toHaveBeenNthCalledWith(1, 'frame');
    expect(onToggleInspector).toHaveBeenNthCalledWith(2, 'browser-frame');
    expect(onToggleInspector).toHaveBeenNthCalledWith(3, 'meta');
    expect(onToggleInspector).toHaveBeenNthCalledWith(4, 'canvas-size');
  });
});
