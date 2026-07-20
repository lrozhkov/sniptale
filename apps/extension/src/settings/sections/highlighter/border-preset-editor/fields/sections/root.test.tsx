// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('../../../../../section-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../section-surface')>()),
  SettingsRangeField: ({ label }: { label: string }) => <div>{label}</div>,
}));

import { EditorPreview } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

it('re-exports the owner-local component through the folder path', async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root!.render(
      <EditorPreview
        state={
          {
            cssError: null,
            previewStyle: {},
          } as never
        }
      />
    );
  });

  expect(container.textContent).toContain('highlighter.editor.previewLabel');
});
