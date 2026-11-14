// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { AudioProcessing } from '@sniptale/runtime-contracts/audio-effects';
import { createAudioEffectInstance } from '../../features/video/audio/effects/catalog';
import { AudioProcessingFields } from './processing-fields';
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
});
function render(
  value: AudioProcessing | undefined,
  disabled = false,
  createDefaultProcessing?: () => AudioProcessing | null | undefined
) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  act(() =>
    root.render(
      <AudioProcessingFields
        value={value}
        onChange={onChange}
        disabled={disabled}
        createDefaultProcessing={createDefaultProcessing}
      />
    )
  );
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  const click = (label: string) => {
    const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    if (!button) throw new Error(`Missing control: ${label}`);
    act(() => button.click());
  };
  const replaceSelection = (key: string, next: AudioProcessing) => {
    act(() => root.render(<AudioProcessingFields key={key} value={next} onChange={onChange} />));
  };
  return { host, onChange, click, replaceSelection };
}
const first = createAudioEffectInstance('eq', 'b1b80118-71a9-4e59-89d2-a95ba0139aa1');
const second = createAudioEffectInstance('delay', 'a7b3b310-1256-455b-80ee-f506e5144797');
it('retains authored processing when bypassing and creates only fixed source processors', () => {
  const value: AudioProcessing = { version: 1, bypassed: false, effects: [first] };
  const { onChange, click } = render(value);
  click('audioProcessing.title');
  expect(onChange).toHaveBeenLastCalledWith({ ...value, bypassed: true });
  click('audioProcessing.denoise');
  expect(onChange.mock.calls.at(-1)![0]).toMatchObject({
    effects: [first],
    denoise: { enabled: true, processor: { engine: 'rnnoise' } },
  });
  click('audioProcessing.pitchEnabled');
  expect(onChange.mock.calls.at(-1)![0]).toMatchObject({
    effects: [first],
    pitch: { enabled: true, semitones: 0, processor: { engine: 'signalsmith' } },
  });
  expect(value.effects).toEqual([first]);
});
it('reorders and removes whole instances as one controlled change and preserves their identities', () => {
  const { host, onChange } = render({ version: 1, bypassed: false, effects: [first, second] });
  const row = host.querySelector(`[data-audio-effect="${second.id}"]`)!;
  act(() => row.querySelector<HTMLButtonElement>('[aria-label="audioProcessing.moveUp"]')!.click());
  expect(onChange).toHaveBeenCalledOnce();
  expect(onChange.mock.calls[0]![0].effects).toEqual([second, first]);
  act(() => row.querySelector<HTMLButtonElement>('[aria-label="audioProcessing.remove"]')!.click());
  expect(onChange.mock.calls[1]![0].effects).toEqual([first]);
});
it('preserves an unavailable implementation and offers explicit reset or bypass', () => {
  const unavailable = structuredClone(first);
  unavailable.processor.sha256 = '0'.repeat(64);
  const { host, onChange, click } = render({ version: 1, bypassed: false, effects: [unavailable] });
  expect(host.textContent).toContain('audioProcessing.unavailable');
  click('audioProcessing.reset');
  expect(onChange.mock.calls[0]![0].effects).toEqual([first]);
  click('audioProcessing.title');
  expect(onChange.mock.calls[1]![0].effects).toEqual([unavailable]);
});
it('does not mutate a disabled target', () => {
  const { host, onChange } = render({ version: 1, bypassed: false, effects: [first] }, true);
  for (const button of host.querySelectorAll<HTMLButtonElement>('button')) {
    if (!button.disabled) continue;
    act(() => button.click());
  }
  expect(onChange).not.toHaveBeenCalled();
});

it('clears processing through one explicit controlled command', () => {
  const { click, onChange } = render({ version: 1, bypassed: false, effects: [first] });
  click('audioProcessing.resetAll');
  expect(onChange).toHaveBeenCalledExactlyOnceWith(undefined);
});
it.each(['pointerup', 'pointercancel'] as const)(
  'keeps repeated numeric drafts local until %s',
  (finish) => {
    const { host, onChange } = render({ version: 1, bypassed: false, effects: [first] });
    const range = host.querySelector<HTMLInputElement>(
      '[aria-label="audioProcessing.controls.gain range"]'
    )!;
    expect(range).not.toBeNull();
    act(() => range.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    for (const value of ['3', '5', '7']) {
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          range,
          value
        );
        range.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(onChange).not.toHaveBeenCalled();
    }
    act(() => range.dispatchEvent(new MouseEvent(finish, { bubbles: true })));
    if (finish === 'pointerup') {
      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange.mock.calls[0]![0].effects[0].parameters.gain).toBe(7);
    } else expect(onChange).not.toHaveBeenCalled();
  }
);

it('discards an uncommitted numeric gesture when the selected audio owner changes', () => {
  const value: AudioProcessing = { version: 1, bypassed: false, effects: [first] };
  const { host, onChange, replaceSelection } = render(value);
  const previous = host.querySelector<HTMLInputElement>(
    '[aria-label="audioProcessing.controls.gain range"]'
  )!;
  act(() => previous.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(previous, '7');
    previous.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const next = structuredClone(value);
  if (next.effects[0]?.kind !== 'eq') throw new Error('Expected EQ fixture');
  next.effects[0].parameters.gain = -3;
  replaceSelection('next-owner', next);
  act(() => previous.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
  expect(onChange).not.toHaveBeenCalled();
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="audioProcessing.controls.gain range"]')!
      .value
  ).toBe('-3');
});

it.each([undefined, { version: 1 as const, bypassed: true, effects: [] }])(
  'materializes the selected default only when enabling a cleared chain: %j',
  (previous) => {
    const preset: AudioProcessing = { version: 1, bypassed: false, effects: [first] };
    const createDefault = vi.fn(() => preset);
    const { click, onChange } = render(previous, false, createDefault);
    expect(createDefault).not.toHaveBeenCalled();
    click('audioProcessing.title');
    expect(createDefault).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(preset);
  }
);
it('retains an existing bypassed chain instead of substituting the global default', () => {
  const previous: AudioProcessing = { version: 1, bypassed: true, effects: [second] };
  const createDefault = vi.fn(() => ({ version: 1 as const, bypassed: false, effects: [first] }));
  const { click, onChange } = render(previous, false, createDefault);
  click('audioProcessing.title');
  expect(createDefault).not.toHaveBeenCalled();
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...previous, bypassed: false });
});

it.each(['audioProcessing.denoise', 'audioProcessing.pitchEnabled', 'audioProcessing.effects.eq'])(
  'activates the processing master when explicitly enabling %s after bypass',
  (label) => {
    const effect = { ...first, enabled: false };
    const { click, onChange } = render({ version: 1, bypassed: true, effects: [effect] });
    click(label);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0]![0].bypassed).toBe(false);
    if (label === 'audioProcessing.denoise')
      expect(onChange.mock.calls[0]![0].denoise.enabled).toBe(true);
    if (label === 'audioProcessing.pitchEnabled')
      expect(onChange.mock.calls[0]![0].pitch.enabled).toBe(true);
    if (label === 'audioProcessing.effects.eq')
      expect(onChange.mock.calls[0]![0].effects[0].enabled).toBe(true);
  }
);
it('keeps deliberate master bypass when disabling a retained local effect', () => {
  const { click, onChange } = render({ version: 1, bypassed: true, effects: [first] });
  click('audioProcessing.effects.eq');
  expect(onChange.mock.calls[0]![0].bypassed).toBe(true);
  expect(onChange.mock.calls[0]![0].effects[0].enabled).toBe(false);
});
