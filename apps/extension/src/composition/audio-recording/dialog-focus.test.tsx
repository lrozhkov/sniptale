// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useAudioRecordingFocus } from './dialog-focus';
it('contains Tab focus across changing recording controls and restores the opener', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const opener = document.createElement('button');
  const host = document.createElement('div');
  document.body.append(opener, host);
  opener.focus();
  const root = createRoot(host);
  function Subject({ busy }: { busy: boolean }) {
    const focus = useAudioRecordingFocus(true);
    return (
      <div role="dialog" onKeyDown={focus.handleKeyDown}>
        <h2 id={focus.titleId}>Recording</h2>
        <button disabled={busy}>Start</button>
        <button>Cancel</button>
      </div>
    );
  }
  try {
    act(() => root.render(<Subject busy={false} />));
    const [start, cancel] = [...host.querySelectorAll('button')];
    expect(document.activeElement).toBe(start);
    expect(host.querySelector('[role="dialog"]')!.getAttribute('aria-modal')).toBe('true');
    cancel!.focus();
    act(() =>
      cancel!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      )
    );
    expect(document.activeElement).toBe(start);
    act(() => root.render(<Subject busy />));
    expect(document.activeElement).toBe(cancel);
    act(() => root.unmount());
    expect(document.activeElement).toBe(opener);
  } finally {
    host.remove();
    opener.remove();
    vi.unstubAllGlobals();
  }
});
