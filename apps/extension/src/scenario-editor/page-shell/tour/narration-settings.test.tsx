// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTourImageSlide } from '../../../features/scenario/project/public';
import { createTranslator } from '../../../platform/i18n';
import { TourNarrationSettings } from './narration-settings';
vi.mock('../../../platform/i18n', async (original) => {
  const module = await original<typeof import('../../../platform/i18n')>();
  return { ...module, translate: module.createTranslator('en') };
});
vi.mock('./narration-preview', () => ({ TourNarrationPreview: () => <div data-preview /> }));
vi.mock('./fields', () => ({ TourTextField: () => null }));
let root: Root;
let host: HTMLDivElement;
const onImport = vi.fn();
const onChange = vi.fn();
const narration = {
  assetId: 'voice',
  duration: 4,
  trimStart: 0,
  trimEnd: 4,
  gain: 1,
  transcript: '',
};
const slide = { ...createTourImageSlide('slide'), narration };
beforeEach(() => {
  vi.resetAllMocks();
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
const render = (importDisabled = false) =>
  act(async () =>
    root.render(
      <TourNarrationSettings
        slide={slide}
        disabled={false}
        importDisabled={importDisabled}
        onImport={onImport}
        onChange={onChange}
        t={createTranslator('en')}
      />
    )
  );
const choose = () => {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File(['voice'], 'voice.wav', { type: 'audio/wav' })],
  });
  input.dispatchEvent(new Event('change', { bubbles: true }));
};
it('binds file acquisition to the selected slide and aborts on selection unmount', async () => {
  let finish!: (accepted: boolean) => void;
  onImport.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render();
  await act(async () => choose());
  expect(onImport).toHaveBeenCalledOnce();
  const input = onImport.mock.calls[0]![0];
  expect(input).toMatchObject({ slideId: 'slide', expectedNarration: narration });
  expect(input.expectedNarration).not.toBe(narration);
  expect(
    [...host.querySelectorAll('button')].find((button) => button.textContent === 'Upload audio')
      ?.disabled
  ).toBe(true);
  act(() => root.unmount());
  root = createRoot(host);
  expect(input.signal.aborted).toBe(true);
  await act(async () => finish(false));
  expect(onChange).not.toHaveBeenCalled();
});
it('keeps the current narration on failure and permits selecting the same file again', async () => {
  onImport.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await render();
  await act(async () => choose());
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.querySelector('[data-preview]')).not.toBeNull();
  await act(async () => choose());
  expect(onImport).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});
it('removes the narration through slide history and disables acquisition during a page mutation', async () => {
  await render(true);
  expect(
    [...host.querySelectorAll('button')].find((button) => button.textContent === 'Upload audio')
      ?.disabled
  ).toBe(true);
  const remove = [...host.querySelectorAll('button')].find(
    (button) => button.title === 'Unlink narration'
  )!;
  act(() => remove.click());
  expect(onChange).toHaveBeenCalledWith({ ...slide, narration: null }, undefined);
});

it('commits trim and amplification through the existing slide edit callback', async () => {
  await render();
  for (const [label, value, key, expected] of [
    ['Start, s', '1', 'trimStart', 1],
    ['End, s', '3', 'trimEnd', 3],
    ['Volume', '150', 'gain', 1.5],
  ] as const) {
    const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    act(() => input.focus());
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ narration: expect.objectContaining({ [key]: expected }) }),
      'narration:slide'
    );
  }
});
it('opens a recording draft and closes it without altering saved narration', async () => {
  await render();
  act(() =>
    [...host.querySelectorAll('button')].find((button) => button.textContent === 'Record')!.click()
  );
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  act(() =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent === 'Cancel')!
      .click()
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(onImport).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
});

it('edits and unlinks an object binding without altering slide narration', async () => {
  const objectSlide = {
    ...slide,
    annotations: [
      {
        id: 'hint',
        text: 'Hint',
        anchor: null,
        appearance: null,
        narration: { ...narration, trigger: 'enter' as const },
      },
    ],
  };
  await act(async () =>
    root.render(
      <TourNarrationSettings
        slide={objectSlide}
        objectId="hint"
        resources={[{ assetId: 'voice', duration: 4, name: 'Voice.wav' }]}
        disabled={false}
        importDisabled={false}
        onImport={onImport}
        onChange={onChange}
        t={createTranslator('en')}
      />
    )
  );
  expect(host.textContent).toContain('Object narration');
  expect(host.querySelector('[aria-label="Narration starts"]')?.textContent).toContain(
    'When the slide opens'
  );
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Volume"]')!;
  act(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '150');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      narration,
      annotations: [
        expect.objectContaining({ narration: { ...narration, trigger: 'enter', gain: 1.5 } }),
      ],
    }),
    'narration:slide:hint'
  );
  act(() => host.querySelector<HTMLButtonElement>('button[title="Unlink narration"]')!.click());
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      narration,
      annotations: [expect.objectContaining({ narration: null })],
    }),
    undefined
  );
});

it('chooses a reusable material while preserving the selected object trigger', async () => {
  const objectSlide = {
    ...slide,
    annotations: [
      {
        id: 'hint',
        text: 'Hint',
        anchor: null,
        appearance: null,
        narration: { ...narration, trigger: 'enter' as const },
      },
    ],
  };
  onChange.mockReturnValue(true);
  await act(async () =>
    root.render(
      <TourNarrationSettings
        slide={objectSlide}
        objectId="hint"
        resources={[{ assetId: 'other', duration: 3, name: 'Other.wav' }]}
        disabled={false}
        importDisabled={false}
        onImport={onImport}
        onChange={onChange}
        t={createTranslator('en')}
      />
    )
  );
  act(() =>
    [...host.querySelectorAll('button')].find((b) => b.textContent === 'From resources')!.click()
  );
  act(() => host.querySelector<HTMLButtonElement>('.tour-audio-picker .tour-audio-name')!.click());
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      narration,
      annotations: [
        expect.objectContaining({
          narration: {
            assetId: 'other',
            duration: 3,
            trimStart: 0,
            trimEnd: 3,
            gain: 1,
            transcript: '',
            trigger: 'enter',
          },
        }),
      ],
    }),
    undefined
  );
  expect(host.querySelector('.tour-audio-picker')).toBeNull();
  expect(onImport).not.toHaveBeenCalled();
});
