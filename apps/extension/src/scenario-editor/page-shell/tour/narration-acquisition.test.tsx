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
