// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createTranslator } from '../../../platform/i18n';
import { TourNarrationAcquisition } from './narration-acquisition';

const draft = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('./narration-recording', () => ({
  TourNarrationRecording: (props: unknown) => {
    draft.render(props);
    return null;
  },
}));
const host = document.createElement('div');
let root: ReturnType<typeof createRoot>;
afterEach(() => {
  act(() => root?.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('creates resource-only recording intent with a resource save label', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <TourNarrationAcquisition
        destination={{ slideId: null, objectId: null, expectedNarration: null }}
        disabled={false}
        onImport={vi.fn()}
        t={createTranslator('en')}
      />
    )
  );
  act(() => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Record')!.click());
  expect(draft.render).toHaveBeenCalledWith(
    expect.objectContaining({ saveLabel: 'Save to resources' })
  );
});
it('retains a failed resources upload for retry without assigning it to a selected slide', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  document.body.append(host);
  root = createRoot(host);
  const onImport = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  act(() =>
    root.render(
      <TourNarrationAcquisition
        destination={{ slideId: null, objectId: null, expectedNarration: null }}
        disabled={false}
        onImport={onImport}
        t={createTranslator('en')}
      />
    )
  );
  const input = host.querySelector<HTMLInputElement>('input')!;
  Object.defineProperty(input, 'files', {
    value: [new File(['voice'], 'Voice.wav', { type: 'audio/wav' })],
  });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(onImport).toHaveBeenCalledWith(
    expect.objectContaining({ slideId: null, objectId: null, expectedNarration: null })
  );
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(onImport).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role=alert]')).toBeNull();
});

it('imports music with its captured binding and offers upload without recording', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  document.body.append(host);
  root = createRoot(host);
  const onImport = vi.fn().mockResolvedValue(true);
  act(() =>
    root.render(
      <TourNarrationAcquisition
        uploadOnly
        destination={{
          slideId: null,
          objectId: null,
          expectedNarration: null,
          destination: { kind: 'background-music', expected: null },
        }}
        disabled={false}
        onImport={onImport}
        t={createTranslator('en')}
      />
    )
  );
  expect(
    [...host.querySelectorAll('button')].some((button) => button.textContent === 'Record')
  ).toBe(false);
  const input = host.querySelector<HTMLInputElement>('input')!;
  Object.defineProperty(input, 'files', {
    value: [new File(['music'], 'Music.wav', { type: 'audio/wav' })],
  });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(onImport).toHaveBeenCalledWith(
    expect.objectContaining({ destination: { kind: 'background-music', expected: null } })
  );
  expect(draft.render).not.toHaveBeenCalled();
});

it('keeps rejected catalog selection open and closes only after an accepted binding', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  document.body.append(host);
  root = createRoot(host);
  const resource = { assetId: 'voice', duration: 3, name: 'Voice.wav' };
  const onChoose = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
  act(() =>
    root.render(
      <TourNarrationAcquisition
        destination={{ slideId: 'slide', objectId: null, expectedNarration: null }}
        disabled={false}
        onImport={vi.fn()}
        catalog={{ resources: [resource], disabled: false, onChoose }}
        t={createTranslator('en')}
      />
    )
  );
  const choose = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === 'From resources'
  )!;
  act(() => choose.click());
  expect(choose.getAttribute('aria-expanded')).toBe('true');
  const entry = host.querySelector<HTMLButtonElement>('.tour-audio-picker .tour-audio-name')!;
  act(() => entry.click());
  expect(host.contains(entry)).toBe(true);
  expect(onChoose).toHaveBeenLastCalledWith(resource);
  act(() => entry.click());
  expect(host.querySelector('.tour-audio-picker')).toBeNull();
  expect(choose.getAttribute('aria-expanded')).toBe('false');
});

it('preserves independent import and catalog binding disable states', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  document.body.append(host);
  root = createRoot(host);
  const draw = (importDisabled: boolean, bindingDisabled: boolean) =>
    act(() =>
      root.render(
        <TourNarrationAcquisition
          destination={{ slideId: 'slide', objectId: null, expectedNarration: null }}
          disabled={importDisabled}
          onImport={vi.fn()}
          catalog={{
            resources: [{ assetId: 'voice', duration: 3, name: 'Voice.wav' }],
            disabled: bindingDisabled,
            onChoose: () => false,
          }}
          t={createTranslator('en')}
        />
      )
    );
  draw(false, false);
  const choose = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === 'From resources'
  )!;
  act(() => choose.click());
  draw(true, false);
  expect(choose.matches(':disabled')).toBe(true);
  expect(
    host.querySelector<HTMLButtonElement>('.tour-audio-picker .tour-audio-name')!.disabled
  ).toBe(false);
  draw(false, true);
  expect(choose.disabled).toBe(true);
  expect(
    host.querySelector<HTMLButtonElement>('.tour-audio-picker .tour-audio-name')!.disabled
  ).toBe(true);
  expect(host.querySelector<HTMLFieldSetElement>('fieldset')!.disabled).toBe(false);
});
