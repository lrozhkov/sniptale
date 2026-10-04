// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { InspectorDetails } from './details';
import { InspectorDisclosurePreferences } from '../../../../../composition/inspector-disclosures/state';
import { createInspectorDisclosureStore } from '../../../../../composition/persistence/inspector-disclosures/store';

it.each(['section', 'group'] as const)(
  'restores native %s without treating hydration as a user edit',
  async (level) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const key = JSON.stringify(['video:clip', 'audio']);
    const values = { [`sniptale_inspector_disclosure_v1:${key}`]: false };
    const set = vi.fn(async () => {});
    const store = createInspectorDisclosureStore({ get: async () => values, set });
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <InspectorDisclosurePreferences scope="video:clip" store={store}>
            <InspectorDetails preferenceId="audio" label="Audio" level={level} initiallyOpen>
              <input defaultValue="draft" />
            </InspectorDetails>
          </InspectorDisclosurePreferences>
        )
      );
      const details = host.querySelector('details')!;
      expect(details.open).toBe(false);
      await act(async () => {
        details.dispatchEvent(new Event('toggle'));
      });
      expect(set).not.toHaveBeenCalled();
      const input = host.querySelector('input')!;
      input.value = 'pending';
      await act(async () => {
        details.open = true;
        details.dispatchEvent(new Event('toggle'));
      });
      expect(store.read(key)).toBe(true);
      expect(set).toHaveBeenCalledOnce();
      expect(input.value).toBe('pending');
      expect(host.querySelector(level === 'section' ? 'h3' : 'h4')?.textContent).toBe('Audio');
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  }
);
