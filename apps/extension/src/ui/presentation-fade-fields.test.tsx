// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PresentationFadeFields } from './presentation-fade-fields';

vi.mock('../platform/i18n', async (original) => ({
  ...(await original<typeof import('../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('keeps inherited audio and color omitted when committing only duration', () => {
  const onChange = vi.fn();
  const onPreview = vi.fn();
  act(() =>
    root.render(
      <PresentationFadeFields
        value={{ enabled: false, duration: 4 }}
        duration={1.25}
        fallbackColor="#112233ff"
        fallbackAudioFade={true}
        onChange={onChange}
        onPreview={onPreview}
      />
    )
  );
  expect(onChange).not.toHaveBeenCalled();
  const field = host.querySelector<HTMLInputElement>(
    'input[aria-label="gallery.videoReview.presentationDuration"]'
  )!;
  expect(field.value).toContain('1.25');
  act(() => field.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, '2');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ duration: 2 });
  const audio = host.querySelector<HTMLButtonElement>('[role="switch"]')!;
  expect(audio.getAttribute('aria-checked')).toBe('true');
  act(() => audio.click());
  expect(onChange).toHaveBeenLastCalledWith({ audioFade: false });
});

it('keeps media-disabled fields dormant and leaves enablement with the caller', () => {
  const onChange = vi.fn();
  act(() =>
    root.render(
      <PresentationFadeFields
        value={{ enabled: false, duration: 3 }}
        enabledLabel="Media fade"
        fallbackColor="#000000ff"
        fallbackAudioFade={false}
        onChange={onChange}
        onPreview={() => undefined}
      >
        <button>Preview</button>
      </PresentationFadeFields>
    )
  );
  expect(host.querySelector('input')).toBeNull();
  expect(host.textContent).not.toContain('Preview');
  const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]')!;
  act(() => toggle.click());
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ enabled: true });
  expect(host.querySelector('input')).toBeNull();
});

it('does not quantize an untouched fine value and cancels a local numeric draft', () => {
  const onChange = vi.fn();
  const onPreview = vi.fn();
  act(() =>
    root.render(
      <PresentationFadeFields
        value={{ enabled: true, duration: 0.123456 }}
        fallbackColor="#000000ff"
        fallbackAudioFade={false}
        onChange={onChange}
        onPreview={onPreview}
      />
    )
  );
  const field = host.querySelector<HTMLInputElement>('input')!;
  act(() => field.focus());
  act(() => field.blur());
  expect(onChange).not.toHaveBeenCalled();
  act(() => field.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, '9');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(onChange).not.toHaveBeenCalled();
  expect(onPreview).toHaveBeenLastCalledWith(null);
});

it('clears a temporary color preview on picker cancel without committing a value', () => {
  const onChange = vi.fn();
  const onPreview = vi.fn();
  act(() =>
    root.render(
      <PresentationFadeFields
        value={{ enabled: true, duration: 1, color: '#ff0000ff' }}
        fallbackColor="#000000ff"
        fallbackAudioFade={false}
        onChange={onChange}
        onPreview={onPreview}
      />
    )
  );
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="shared.ui.color-selector.picker-trigger"]')!
      .click()
  );
  const picker = document.querySelector('[data-ui="shared.ui.color-selector.picker"]')!;
  const hex = picker.querySelector<HTMLInputElement>(
    'input[aria-label="shared.ui.colorSelectorHex"]'
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(hex, '#00ff00');
    hex.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(onPreview).toHaveBeenLastCalledWith({ color: '#00ff00' });
  const cancel = Array.from(picker.querySelectorAll('button')).find(
    (button) => button.textContent === 'shared.ui.colorSelectorCancel'
  )!;
  act(() => cancel.click());
  expect(onChange).not.toHaveBeenCalled();
  expect(onPreview).toHaveBeenLastCalledWith(null);
});
