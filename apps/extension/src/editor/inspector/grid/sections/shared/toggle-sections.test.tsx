// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../chrome/ui')>()),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

import { EditorInspectorGridToggleSections } from './toggle-sections';

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

it('wires grid toggle actions to workspace updates', () => {
  const updateWorkspace = vi.fn();

  act(() => {
    root?.render(
      <EditorInspectorGridToggleSections
        gridEnabled
        gridSnapEnabled={false}
        updateWorkspace={updateWorkspace}
      />
    );
  });

  const buttons = Array.from(container?.querySelectorAll('button') ?? []);

  act(() => {
    buttons[0]?.click();
    buttons[1]?.click();
  });

  expect(updateWorkspace).toHaveBeenNthCalledWith(1, { gridEnabled: false });
  expect(updateWorkspace).toHaveBeenNthCalledWith(2, { gridSnapEnabled: true });
  expect(buttons).toHaveLength(2);
});

it('renders canonical switches with state and action labels', () => {
  const updateWorkspace = vi.fn();

  act(() => {
    root?.render(
      <EditorInspectorGridToggleSections
        gridEnabled={false}
        gridSnapEnabled={true}
        updateWorkspace={updateWorkspace}
      />
    );
  });

  expect(container?.querySelector('[aria-label="editor.compact.showGrid"]')).not.toBeNull();
  expect(container?.querySelector('[aria-label="editor.compact.disableSnap"]')).not.toBeNull();
  expect(container?.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
  expect(container?.querySelectorAll('[aria-pressed="false"]')).toHaveLength(1);
  expect(container?.textContent).not.toContain('editor.compact.magnet');
});
