// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createBookendImagePresentation,
  createBookendVideoPresentation,
} from '../features/video/project/scene/bookend-media';
import type { InspectorDisclosureProps } from './compact-inspector-controls/shared';
import { PresentationMediaFields } from './presentation-media-fields';

vi.mock('../platform/i18n', async (original) => ({
  ...(await original<typeof import('../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
function Details(props: InspectorDisclosureProps) {
  return (
    <section aria-label={props.label} data-preference={props.preferenceId}>
      {props.children}
    </section>
  );
}
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
function click(label: string) {
  const target = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) =>
      item.textContent === `gallery.videoReview.${label}` ||
      item.getAttribute('aria-label') === `gallery.videoReview.${label}`
  );
  if (!target) throw new Error(`Missing ${label}`);
  act(() => target.click());
}

it('uses two direct fit choices and preserves fractional crop while switching representation', () => {
  const change = vi.fn();
  const value = { ...createBookendImagePresentation(), crop: { panX: 0.37, panY: -0.43 } };
  act(() =>
    root.render(
      <PresentationMediaFields
        kind="image"
        value={value}
        Details={Details}
        preferenceId="intro"
        onChange={change}
        onPreview={vi.fn()}
      />
    )
  );
  expect(host.querySelector('[data-preference="intro.framing"]')).not.toBeNull();
  expect(host.querySelector('select')).toBeNull();
  click('presentationCover');
  expect(change).toHaveBeenCalledExactlyOnceWith({ ...value, fit: 'cover' });
  act(() =>
    root.render(
      <PresentationMediaFields
        kind="image"
        value={{ ...value, fit: 'cover' }}
        Details={Details}
        preferenceId="intro"
        onChange={change}
        onPreview={vi.fn()}
      />
    )
  );
  click('presentationCenter');
  expect(change.mock.lastCall?.[0]).toMatchObject({ crop: { panX: 0, panY: 0 }, duration: 3 });
});

it('groups video bounds and sound, retains gain on mute, and accepts Native source duration', () => {
  const change = vi.fn();
  const value = { ...createBookendVideoPresentation(7200), audio: { muted: false, gain: 1.37 } };
  act(() =>
    root.render(
      <PresentationMediaFields
        kind="video"
        value={value}
        sourceDuration={7200}
        hasAudio
        Details={Details}
        preferenceId="outro"
        onChange={change}
        onPreview={vi.fn()}
      />
    )
  );
  const bounds = host.querySelector('[data-preference="outro.trim"]');
  expect(bounds?.textContent).toContain('gallery.videoReview.presentationTrimStart');
  expect(bounds?.textContent).toContain('gallery.videoReview.presentationTrimEnd');
  act(() => host.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
  expect(change).toHaveBeenCalledExactlyOnceWith({ ...value, audio: { muted: true, gain: 1.37 } });
  act(() =>
    root.render(
      <PresentationMediaFields
        kind="video"
        value={value}
        sourceDuration={7200}
        hasAudio={false}
        Details={Details}
        preferenceId="outro"
        onChange={change}
        onPreview={vi.fn()}
      />
    )
  );
  expect(host.querySelector('[role="switch"]')).toBeNull();
  expect(host.textContent).not.toContain('gallery.videoReview.presentationVolume');
});
