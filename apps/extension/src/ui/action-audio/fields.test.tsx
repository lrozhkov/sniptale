// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ActionAudioFields } from './fields';
import {
  REVIEW_ACTION_AUDIO_DEFAULT,
  type ReviewActionAudioTarget,
} from '../../features/video/review/advanced/action-audio';
import { translate } from '../../platform/i18n';

vi.mock('../compact-inspector-controls', async (original) => ({
  ...(await original<typeof import('../compact-inspector-controls')>()),
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
  CompactSelect: (p: {
    'aria-label': string;
    value: string;
    options: { value: string; label: string }[];
    onChange(value: string): void;
  }) => (
    <select
      aria-label={p['aria-label']}
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
}));

vi.mock('../compact-inspector-controls/control-renderers', () => ({
  CompactSegmentedSelector: (p: {
    ariaLabel: string;
    value: string;
    options: { value: string; label: string; disabled?: boolean }[];
    onChange(value: string): void;
  }) => (
    <select
      aria-label={p.ariaLabel}
      value={p.value}
      onChange={(event) => p.onChange(event.currentTarget.value)}
    >
      <option value="" />
      {p.options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
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
        <ActionAudioFields targets={targets} settings={[]} busy={false} onChange={onChange} />
      )
    );
    expect(
      host.querySelector(`[aria-label="${translate('gallery.videoReview.actionAudioEnabled')}"]`)
    ).toBeNull();
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
    const volume = host.querySelector<HTMLInputElement>('input[type="number"]')!;
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
it('paired phases and recorded repeats target their own families and stop audition on selection change', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'),
    root = createRoot(host);
  const mouse: ReviewActionAudioTarget = { ref: { kind: 'action', id: 'mouse' }, family: 'mouse' };
  const typing: ReviewActionAudioTarget = {
    ref: { kind: 'signal', id: 'typing' },
    family: 'typing',
    recorded: true,
  };
  const targets = [mouse, typing],
    onChange = vi.fn(),
    stop = vi.fn(),
    audition = vi.fn();
  const settings = [
    {
      ...REVIEW_ACTION_AUDIO_DEFAULT,
      ref: mouse.ref,
      enabled: true,
      presetId: 'mouse-classic-paired-v2' as const,
    },
    {
      ...REVIEW_ACTION_AUDIO_DEFAULT,
      ref: typing.ref,
      enabled: true,
      presetId: 'typing-recorded-v2' as const,
    },
  ];
  const clickLabel = (label: Parameters<typeof translate>[0]) =>
    act(() => host.querySelector<HTMLElement>(`[aria-label="${translate(label)}"]`)!.click());
  try {
    act(() =>
      root.render(
        <ActionAudioFields
          targets={targets}
          settings={settings}
          busy={false}
          onChange={onChange}
          onAudition={audition}
          onStopAudition={stop}
        />
      )
    );
    clickLabel('gallery.videoReview.actionAudioDown');
    expect(onChange).toHaveBeenLastCalledWith([mouse], { downEnabled: false });
    clickLabel('gallery.videoReview.actionAudioUp');
    expect(onChange).toHaveBeenLastCalledWith([mouse], { upEnabled: false });
    clickLabel('gallery.videoReview.actionAudioRepeats');
    expect(onChange).toHaveBeenLastCalledWith([typing], { includeRepeats: true });
    for (const [label, field] of [
      ['gallery.videoReview.actionAudioDownGain', 'downGain'],
      ['gallery.videoReview.actionAudioUpGain', 'upGain'],
    ] as const) {
      const input = host.querySelector<HTMLInputElement>(
        `input[aria-label="${translate(label!)}"]`
      )!;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          '25'
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(onChange).toHaveBeenLastCalledWith([mouse], { [field!]: 0.25 });
    }
    act(() =>
      root.render(
        <ActionAudioFields
          targets={[]}
          settings={settings}
          busy={false}
          onChange={onChange}
          onStopAudition={stop}
        />
      )
    );
    expect(stop).toHaveBeenCalledOnce();
    expect(host.textContent).toBe('');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('shows None for a persisted disabled preset and keeps audition beside its selector', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'),
    root = createRoot(host);
  const target: ReviewActionAudioTarget = { ref: { kind: 'action', id: 'mouse' }, family: 'mouse' };
  const audition = vi.fn();
  try {
    act(() =>
      root.render(
        <ActionAudioFields
          targets={[target]}
          settings={[
            {
              ...REVIEW_ACTION_AUDIO_DEFAULT,
              ref: target.ref,
              presetId: 'mouse-soft-v1',
              enabled: false,
            },
          ]}
          busy={false}
          onChange={vi.fn()}
          onAudition={audition}
        />
      )
    );
    const select = host.querySelector('select')!;
    expect(select.value).toBe('none');
    const listen = host.querySelector<HTMLButtonElement>(
      `[aria-label="${translate('gallery.videoReview.actionAudioListen')}"]`
    )!;
    expect(listen.disabled).toBe(true);
    expect(
      select.closest('[data-family]')?.querySelector('[data-audio-choice-row]')?.contains(listen)
    ).toBe(true);
    act(() => listen.click());
    expect(audition).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('shows mixed paired phases and keyboard repeats as indeterminate bulk booleans', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'),
    root = createRoot(host),
    change = vi.fn();
  const targets: ReviewActionAudioTarget[] = [
    { ref: { kind: 'action', id: 'mouse-a' }, family: 'mouse' },
    { ref: { kind: 'action', id: 'mouse-b' }, family: 'mouse' },
    { ref: { kind: 'action', id: 'key-a' }, family: 'keyboard' },
    { ref: { kind: 'action', id: 'key-b' }, family: 'keyboard' },
  ];
  try {
    act(() =>
      root.render(
        <ActionAudioFields
          targets={targets}
          busy={false}
          onChange={change}
          settings={targets.map((target, index) => ({
            ...REVIEW_ACTION_AUDIO_DEFAULT,
            ref: target.ref,
            enabled: true,
            presetId:
              target.family === 'mouse' ? 'mouse-classic-paired-v2' : 'keyboard-recorded-v2',
            downEnabled: index % 2 === 0,
            includeRepeats: index % 2 === 0,
          }))}
        />
      )
    );
    const down = host.querySelector<HTMLInputElement>(
      `[aria-label="${translate('gallery.videoReview.actionAudioDown')}"]`
    )!;
    const repeats = host.querySelector<HTMLInputElement>(
      `[aria-label="${translate('gallery.videoReview.actionAudioRepeats')}"]`
    )!;
    expect(down.indeterminate).toBe(true);
    expect(repeats.indeterminate).toBe(true);
    act(() => down.click());
    expect(change).toHaveBeenLastCalledWith(targets.slice(0, 2), { downEnabled: true });
    act(() => repeats.click());
    expect(change).toHaveBeenLastCalledWith(targets.slice(2), { includeRepeats: true });
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
