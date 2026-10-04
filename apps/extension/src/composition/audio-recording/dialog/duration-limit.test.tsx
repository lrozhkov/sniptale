// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { RecordingDurationLimit, useRecordingDurationLimit } from './duration-limit';
import { RecordingPlaybackChoice } from './playback-choice';

it('validates numeric drafts against the current available interval and retains them across switching', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let latest!: ReturnType<typeof useRecordingDurationLimit>;
  function Harness({ maximum }: { maximum: number }) {
    latest = useRecordingDurationLimit(maximum);
    return <RecordingDurationLimit value={latest} maximum={maximum} disabled={false} />;
  }
  const render = (maximum: number) => act(() => root.render(<Harness maximum={maximum} />));
  try {
    render(0);
    expect(latest.invalid).toBe(true);
    render(120);
    expect(latest.seconds).toBe(60);
    for (const text of ['', '0', '-1', '121', 'Infinity']) {
      act(() => latest.setText(text));
      expect(latest.invalid).toBe(true);
      expect(host.querySelector('[role="alert"]')).not.toBeNull();
      expect(host.querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
    }
    act(() => latest.setText('12.5'));
    expect(latest.seconds).toBe(12.5);
    render(10);
    expect(latest.invalid).toBe(true);
    act(() => host.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
    expect(latest.invalid).toBe(false);
    expect(latest.seconds).toBeUndefined();
    expect(latest.effective).toBe(10);
    expect(host.querySelector('input')).toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
    expect(host.querySelector('input')?.value).toBe('12.5');
    expect(latest.invalid).toBe(true);
    act(() => latest.setText('8'));
    expect(latest.seconds).toBe(8);
    expect(latest.effective).toBe(8);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('exposes a labelled real playback switch without a play icon and respects disabled state', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const onChange = vi.fn();
  try {
    act(() =>
      root.render(<RecordingPlaybackChoice checked disabled={false} onChange={onChange} />)
    );
    const control = host.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(control.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector('svg')).toBeNull();
    expect(
      host.querySelector(`[id="${control.getAttribute('aria-labelledby')}"]`)?.textContent
    ).toBeTruthy();
    act(() => control.click());
    expect(onChange).toHaveBeenCalledExactlyOnceWith(false);
    act(() =>
      root.render(<RecordingPlaybackChoice checked={false} disabled onChange={onChange} />)
    );
    act(() => control.click());
    expect(onChange).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('shows a compact fractional default without changing the exact capture interval', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let latest!: ReturnType<typeof useRecordingDurationLimit>;
  function Harness({ maximum }: { maximum: number }) {
    latest = useRecordingDurationLimit(maximum);
    return <RecordingDurationLimit value={latest} maximum={maximum} disabled={false} />;
  }
  try {
    act(() => root.render(<Harness maximum={12.013666666666667} />));
    const input = host.querySelector<HTMLInputElement>('input')!;
    expect(input.value).toBe('12.013');
    expect(latest.seconds).toBe(12.013666666666667);
    act(() => input.focus());
    act(() => input.blur());
    expect(latest.seconds).toBe(12.013666666666667);
    act(() => latest.setEnabled(false));
    act(() => latest.setEnabled(true));
    expect(latest.seconds).toBe(12.013666666666667);
    act(() => root.render(<Harness maximum={7.123456789} />));
    expect(latest.seconds).toBe(7.123456789);
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('7.123');
    const editedInput = host.querySelector<HTMLInputElement>('input')!;
    act(() => editedInput.focus());
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        editedInput,
        '2.123456789'
      );
      editedInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(editedInput.value).toBe('2.123456789');
    act(() => editedInput.blur());
    expect(latest.seconds).toBe(2.123456789);
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('2.123');
    act(() => root.render(<Harness maximum={0.000123456789} />));
    expect(latest.invalid).toBe(true);
    act(() => root.render(<Harness key="tiny" maximum={0.000123456789} />));
    expect(latest.seconds).toBe(0.000123456789);
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('0.000123');
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
