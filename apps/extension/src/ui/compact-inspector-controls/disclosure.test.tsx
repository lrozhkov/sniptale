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

it('shows an optional current-value summary while retaining the mounted editor draft', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  const render = (open: boolean, summary: string) =>
    act(() =>
      root.render(
        <InspectorDisclosureView
          dataUi="test.parameters"
          variant="structural"
          label="Options"
          summary={summary}
          open={open}
          onOpenChange={change}
          bodyClassName="parameters-body"
        >
          <input defaultValue="76" />
        </InspectorDisclosureView>
      )
    );
  try {
    render(false, 'JPEG · 76%');
    const input = host.querySelector('input')!;
    input.value = '82';
    expect(host.querySelector('summary')?.textContent).toContain('JPEG · 76%');
    render(true, 'JPEG · 76%');
    render(false, 'WebP · 82%');
    expect(host.querySelector('summary')?.textContent).toContain('WebP · 82%');
    expect(host.querySelector('input')).toBe(input);
    expect(input.value).toBe('82');
    expect(change).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
