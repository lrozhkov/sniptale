// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewActionAudioFields } from './action-audio-fields';
import type { ReviewActionAudioTarget } from '../../features/video/review/advanced/action-audio';

vi.mock('../../ui/compact-inspector-controls', () => ({
  SelectField: (p: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange(value: string): void;
  }) => (
    <select
      aria-label={p.label}
      value={p.value}
      onChange={(event) => p.onChange(event.currentTarget.value)}
    >
      <option value="" />
      {p.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  NumericRow: (p: {
    label: string;
    value: number | null;
    onPreviewValue(value: number): void;
    onCommitValue(value: number): void;
  }) => (
    <input
      type="number"
      aria-label={p.label}
      value={p.value ?? ''}
      onChange={(event) => {
        const value = event.currentTarget.valueAsNumber;
        p.onPreviewValue(value);
        p.onCommitValue(value);
      }}
    />
  ),
  OptionRow: (p: { label: string; value: string; onToggle(): void }) => (
    <button onClick={p.onToggle}>
      {p.label} {p.value}
    </button>
  ),
}));

it('scopes family selectors to typed targets and patches only the edited common field', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'),
    root = createRoot(host);
  const targets: ReviewActionAudioTarget[] = [
    { ref: { kind: 'action', id: 'same' }, family: 'mouse' },
    { ref: { kind: 'signal', id: 'same' }, family: 'typing' },
    { ref: { kind: 'action', id: 'key' }, family: 'keyboard' },
  ];
  const onChange = vi.fn();
  try {
    act(() =>
      root.render(
        <ReviewActionAudioFields targets={targets} settings={[]} busy={false} onChange={onChange} />
      )
    );
    const selectors = host.querySelectorAll('select');
    expect(selectors).toHaveLength(3);
    act(() => {
      selectors[0]!.value = 'mouse-soft-v1';
      selectors[0]!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith([targets[0]], { presetId: 'mouse-soft-v1' });
    act(() => {
      selectors[2]!.value = 'typing-natural-v1';
      selectors[2]!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith([targets[1]], { presetId: 'typing-natural-v1' });
    const volume = host.querySelector<HTMLInputElement>('input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(volume, '25');
      volume.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(targets, { volume: 0.25 });
    const reset = host.querySelector('[data-ui="gallery.videoReview.actionAudioReset"]')!;
    act(() => reset.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onChange).toHaveBeenLastCalledWith(targets, null);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
