// @vitest-environment jsdom
import { act, memo } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { InspectorDisclosurePreferences, useInspectorDisclosure } from './state';
import { createInspectorDisclosureStore } from '../persistence/inspector-disclosures/store';

function Group({ label }: { label: string }) {
  const [open, setOpen] = useInspectorDisclosure('appearance', true);
  return (
    <button aria-expanded={open} onClick={() => setOpen(!open)}>
      {label}
    </button>
  );
}

it('separates type choices, ignores localized labels, and restores a new provider', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const values: Record<string, unknown> = {};
  const storage = {
    get: async () => values,
    set: async (next: Record<string, unknown>) => {
      Object.assign(values, next);
    },
  };
  let store = createInspectorDisclosureStore(storage);
  const host = document.createElement('div');
  const root = createRoot(host);
  const render = (scope: string, label: string) =>
    root.render(
      <InspectorDisclosurePreferences scope={scope} store={store}>
        <Group label={label} />
      </InspectorDisclosurePreferences>
    );
  try {
    await act(async () => render('video:clip', 'Appearance'));
    await act(async () => host.querySelector('button')!.click());
    await act(async () => render('video:scene', 'Appearance'));
    expect(host.querySelector('button')!.getAttribute('aria-expanded')).toBe('true');
    await act(async () => render('video:clip', 'Оформление'));
    expect(host.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');
    await act(async () => root.render(null));
    store = createInspectorDisclosureStore(storage);
    await act(async () => render('video:clip', 'Appearance'));
    expect(host.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('keeps standalone controls operable without a preference owner', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Group label="Appearance" />));
    await act(async () => host.querySelector('button')!.click());
    expect(host.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('does not broadcast unchanged provider values but delivers real scope and store changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const draws = vi.fn();
  const store = createInspectorDisclosureStore({
    get: async () => ({}),
    set: async () => undefined,
  });
  const Consumer = memo(function Consumer() {
    draws();
    const [open] = useInspectorDisclosure('appearance', true);
    return <span>{String(open)}</span>;
  });
  const child = <Consumer />;
  const host = document.createElement('div'),
    root = createRoot(host);
  const render = (scope: string) =>
    root.render(
      <InspectorDisclosurePreferences scope={scope} store={store}>
        {child}
      </InspectorDisclosurePreferences>
    );
  try {
    await act(async () => render('gallery:history'));
    const initial = draws.mock.calls.length;
    await act(async () => render('gallery:history'));
    await act(async () => render('gallery:history'));
    expect(draws).toHaveBeenCalledTimes(initial);
    await act(async () => store.set(JSON.stringify(['gallery:history', 'appearance']), false));
    expect(host.textContent).toBe('false');
    await act(async () => render('video:clip'));
    expect(host.textContent).toBe('true');
    await act(async () => store.set(JSON.stringify(['video:clip', 'appearance']), false));
    expect(host.textContent).toBe('false');
    await act(async () => render('gallery:history'));
    expect(host.textContent).toBe('false');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
