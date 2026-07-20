// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../environment/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../environment/shared')>()),
  PanelSection: (props: Record<string, unknown> & { children?: React.ReactNode }) => (
    <section>
      <div>{String(props['label'])}</div>
      <div>{String(props['value'] ?? '')}</div>
      {props.children}
    </section>
  ),
}));

vi.mock('../../../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../chrome/ui')>()),
  NumericRow: (props: Record<string, unknown>) => (
    <button
      type="button"
      data-testid="grid-size-row"
      onClick={() => (props['onCommitValue'] as ((value: number) => void) | undefined)?.(42)}
    >
      {String(props['label'])}
    </button>
  ),
}));

import { EditorInspectorGridSizeSection } from './size-section';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
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

it('wires numeric row updates through workspace changes', () => {
  const clampGridSize = vi.fn((value: number) => Math.max(8, Math.min(96, value)));
  const updateWorkspace = vi.fn();

  act(() => {
    root?.render(
      <EditorInspectorGridSizeSection
        clampGridSize={clampGridSize}
        gridSize={24}
        gridSizeMax={96}
        gridSizeMin={8}
        updateWorkspace={updateWorkspace}
      />
    );
  });

  const numericRow = container?.querySelector<HTMLButtonElement>('[data-testid="grid-size-row"]');

  act(() => {
    numericRow?.click();
  });

  expect(clampGridSize).toHaveBeenCalledWith(42);
  expect(updateWorkspace).toHaveBeenCalledWith({ gridSize: 42 });
  expect(container?.querySelector('input[type="range"]')).toBeNull();
});
