// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const headerValueToggleMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../environment/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../environment/shared')>()),
  HeaderValueToggleSection: (
    props: Record<string, unknown> & {
      onChange?: (value: string) => void;
    }
  ) => {
    headerValueToggleMock(props);
    return (
      <section>
        <div>{String(props['label'])}</div>
        <button
          type="button"
          aria-label={String(props['ariaLabel'])}
          onClick={() => props.onChange?.(String(props['nextValue']))}
        >
          {String(props['value'])}
        </button>
      </section>
    );
  },
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
  headerValueToggleMock.mockClear();
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

it('renders compact state values and action labels when grid and snap are active', () => {
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

  expect(container?.textContent).toContain('editor.compact.disabledShort');
  expect(container?.textContent).toContain('editor.compact.enabledShort');
  expect(container?.textContent).not.toContain('editor.compact.magnet');
  expect(headerValueToggleMock).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ active: false })
  );
  expect(headerValueToggleMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ active: true })
  );
  expect(container?.querySelector('[aria-label="editor.compact.disableSnap"]')).not.toBeNull();
});
