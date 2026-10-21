// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { PageStyleSelectionSnapshot } from '../../../selection/design-review/snapshot';
import { usePageStyleDraftState } from './draft';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';

it('retains the original property baseline when text editing refreshes the same target', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const element = document.createElement('p');
  const selection: PageStyleSelectionSnapshot = {
    element,
    domPath: 'p',
    kind: 'text',
    selectorLabel: 'p',
    tagName: 'p',
    textPreview: 'Original',
    patch: { declarations: [{ property: 'font-weight', value: '400' }] },
  };
  let state!: ReturnType<typeof usePageStyleDraftState>;
  function Harness(props: { snapshot: PageStyleSelectionSnapshot | null }) {
    state = usePageStyleDraftState(props.snapshot);
    return null;
  }
  try {
    act(() => root.render(<Harness snapshot={selection} />));
    act(() => state.setValues({ 'font-weight': '700' }));
    act(() =>
      root.render(
        <Harness
          snapshot={{
            ...selection,
            textPreview: 'Changed',
            patch: { declarations: [{ property: 'font-weight', value: '700' }] },
          }}
        />
      )
    );
    expect(state.defaultValues['font-weight']).toBe('400');
    expect(state.values['font-weight']).toBe('700');
    expect(state.modifiedProperties).toContain('font-weight');
    const changed = {
      ...selection,
      patch: { declarations: [{ property: 'font-weight' as const, value: '700' }] },
    };
    act(() =>
      root.render(<Harness snapshot={{ ...selection, element: document.createElement('div') }} />)
    );
    act(() => root.render(<Harness snapshot={changed} />));
    expect(state.defaultValues['font-weight']).toBe('400');
    act(() => root.render(<Harness snapshot={null} />));
    act(() => root.render(<Harness snapshot={changed} />));
    expect(state.defaultValues['font-weight']).toBe('400');
    act(() => pagePreparationHistory.clear());
    act(() => root.render(<Harness snapshot={{ ...changed }} />));
    expect(state.defaultValues['font-weight']).toBe('700');
    expect(state.modifiedProperties).toEqual([]);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
