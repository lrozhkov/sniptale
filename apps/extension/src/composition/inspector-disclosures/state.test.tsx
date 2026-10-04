// @vitest-environment jsdom
import { act } from 'react';
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
