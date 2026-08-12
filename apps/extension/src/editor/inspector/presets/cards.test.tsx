// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const tagState = vi.hoisted(() => ({
  error: false,
  isLoading: false,
  setActiveFilterTagIds: vi.fn(async () => true),
  state: {
    schemaVersion: 1,
    activeFilterTagIds: ['review'],
    tags: [{ id: 'review', label: 'Review' }],
  },
}));
vi.mock('../../../ui/annotation-template-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ui/annotation-template-query')>()),
  useAnnotationTemplateTagState: () => tagState,
}));

import { EditorInspectorTemplateCards } from './cards';

it('filters tagged cards while pinning the selected template and exposes clear actions', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <EditorInspectorTemplateCards
        annotationTagFiltering
        groups={[
          {
            id: 'system',
            label: 'System',
            templates: [
              {
                id: 'selected',
                label: 'Pinned',
                preview: null,
                selected: true,
                tagIds: [],
                onApply: vi.fn(),
              },
              {
                id: 'matching',
                label: 'Matching',
                preview: null,
                selected: false,
                tagIds: ['review'],
                onApply: vi.fn(),
              },
              {
                id: 'hidden',
                label: 'Hidden',
                preview: null,
                selected: false,
                tagIds: [],
                onApply: vi.fn(),
              },
            ],
          },
        ]}
      />
    )
  );
  expect(host.querySelector('[data-editor-template-card="selected"]')).not.toBeNull();
  expect(host.querySelector('[data-editor-template-card="matching"]')).not.toBeNull();
  expect(host.querySelector('[data-editor-template-card="hidden"]')).toBeNull();
  expect(host.textContent).toContain('Review');

  const input = host.querySelector<HTMLInputElement>('input[type="text"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, 'absent');
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(host.querySelector('[data-editor-template-card="selected"]')).not.toBeNull();
  expect(host.querySelector('[data-editor-template-card="matching"]')).toBeNull();

  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
