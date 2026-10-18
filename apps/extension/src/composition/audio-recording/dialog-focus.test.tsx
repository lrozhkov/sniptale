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

it('keeps ordinary inspector Tab navigation, respects outside focus, and restores its command', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const opener = document.createElement('button');
  const outside = document.createElement('button');
  const host = document.createElement('div');
  document.body.append(opener, host, outside);
  opener.focus();
  const root = createRoot(host);
  function Subject({ busy }: { busy: boolean }) {
    const focus = useAudioRecordingFocus(true, false, 'inspector', opener);
    return (
      <div role="region" data-ui="audio-recording.inspector" onKeyDown={focus.handleKeyDown}>
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
    expect(host.querySelector('[aria-modal]')).toBeNull();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    cancel!.focus();
    act(() => cancel!.dispatchEvent(tab));
    expect(tab.defaultPrevented).toBe(false);
    outside.focus();
    act(() => root.render(<Subject busy />));
    expect(document.activeElement).toBe(outside);
    cancel!.focus();
    await act(async () => root.unmount());
    expect(document.activeElement).toBe(opener);
  } finally {
    host.remove();
    opener.remove();
    outside.remove();
    vi.unstubAllGlobals();
  }
});
