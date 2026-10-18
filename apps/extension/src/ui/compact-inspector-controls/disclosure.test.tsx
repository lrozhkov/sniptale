// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { InspectorDisclosureView } from './disclosure';

it('keeps workspace styling opt-in and delegates expansion to the current owner', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  try {
    for (const dataUi of ['gallery.videoReview.disclosure', 'video-editor.inspector.disclosure']) {
      act(() =>
        root.render(
          <InspectorDisclosureView
            dataUi={dataUi}
            label="Position"
            open={false}
            onOpenChange={change}
            bodyClassName="existing-workspace-body"
          >
            <input defaultValue="61" />
          </InspectorDisclosureView>
        )
      );
      const details = host.querySelector('details')!;
      expect(details.classList.contains('sniptale-disclosure')).toBe(false);
      expect(details.dataset['ui']).toBe(dataUi);
      expect(details.querySelector('h4')?.textContent).toBe('Position');
      expect(details.querySelector('.existing-workspace-body input')).not.toBeNull();
      act(() => {
        details.open = true;
        details.dispatchEvent(new Event('toggle'));
      });
      expect(change).toHaveBeenLastCalledWith(true);
    }
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
