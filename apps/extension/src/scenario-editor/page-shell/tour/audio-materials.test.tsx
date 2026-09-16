// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/public';
import { createTranslator } from '../../../platform/i18n';
import { TourAudioResources, TourAudioPicker, materialNarration } from './audio-materials';
vi.mock('./narration-preview', () => ({ TourNarrationPreview: () => <div data-preview /> }));
const host = document.createElement('div');
let root: ReturnType<typeof createRoot>;
const t = createTranslator('en');
const resource = { assetId: 'voice', duration: 4, name: 'Voice.wav' };
afterEach(() => {
  act(() => root?.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const click = (title: string) =>
  act(() => host.querySelector<HTMLButtonElement>(`button[title="${title}"]`)!.click());
it('separates preview, exact usage navigation, attachment and material deletion', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  document.body.append(host);
  root = createRoot(host);
  const tour = createTourDocument();
  const slide = createTourImageSlide('slide');
  slide.narration = materialNarration(resource);
  slide.annotations = [
    {
      id: 'hint',
      text: 'Hint',
      anchor: null,
      appearance: null,
      narration: { ...slide.narration, trigger: 'enter' },
    },
  ];
  tour.slides = [slide];
  tour.audioResources = [resource];
  const command = vi.fn();
  const onSelect = vi.fn();
  act(() =>
    root.render(
      <TourAudioResources
        tour={tour}
        selection={{ kind: 'slide', slideId: 'slide', objectId: 'hint' }}
        disabled={false}
        command={command}
        onSelect={onSelect}
        t={t}
      />
    )
  );
  click('Preview audio material');
  expect(host.querySelector('[data-preview]')).not.toBeNull();
  expect(command).not.toHaveBeenCalled();
  click('Bindings: 2');
  expect(onSelect).toHaveBeenCalledWith({ kind: 'slide', slideId: 'slide', objectId: null });
  click('Attach to selection');
  expect(command).toHaveBeenCalledWith({
    kind: 'set-narration',
    slideId: 'slide',
    objectId: 'hint',
    narration: { ...materialNarration(resource), trigger: 'enter' },
  });
  click('Delete material and its bindings');
  expect(command).toHaveBeenLastCalledWith({ kind: 'remove-audio-resource', assetId: 'voice' });
});
it('previews a picker item without choosing it, then attaches on its named button', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  document.body.append(host);
  root = createRoot(host);
  const onChoose = vi.fn();
  act(() =>
    root.render(
      <TourAudioPicker resources={[resource]} disabled={false} onChoose={onChoose} t={t} />
    )
  );
  click('Preview audio material');
  expect(onChoose).not.toHaveBeenCalled();
  act(() => host.querySelector<HTMLButtonElement>('.tour-audio-name')!.click());
  expect(onChoose).toHaveBeenCalledWith(resource);
});
