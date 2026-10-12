// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewCaptionSceneControls } from './caption-controls';
import { ReviewTextPhrase } from './speech-phrase';
import {
  createReviewCaptionSettings,
  editReviewTextFragment,
  reviewVoiceTextStatus,
} from '../../features/video/review/text-document';
import type { ReviewTextFragment } from '../../features/video/review/text-types';
import { useReviewText } from './use-review-text';

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const phrase: ReviewTextFragment = {
  id: 'phrase',
  text: 'Speak',
  originalText: 'Speak',
  start: 0,
  end: 2,
  timeDomain: 'result',
  alignment: 'manual',
  revision: 0,
  timingRevision: 0,
  showInVideo: true,
};
function Scene() {
  const [settings, setSettings] = useState(createReviewCaptionSettings());
  return (
    <>
      <output>{JSON.stringify(settings)}</output>
      <ReviewCaptionSceneControls settings={settings} onChange={setSettings} />
    </>
  );
}
it('starts globally disabled and preserves the configured appearance across disable/enable', async () => {
  await act(async () => root.render(<Scene />));
  const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]')!;
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  expect(host.querySelector('fieldset')).toBeNull();
  act(() => toggle.click());
  expect(host.querySelector('fieldset')).not.toBeNull();
  const top = host.querySelectorAll<HTMLButtonElement>('fieldset button[aria-pressed]')[1]!;
  act(() => top.click());
  expect(JSON.parse(host.querySelector('output')!.textContent!).style.position).toBe('top');
  act(() => toggle.click());
  act(() => toggle.click());
  expect(JSON.parse(host.querySelector('output')!.textContent!).style.position).toBe('top');
});
it('shows inherited/local style compactly and never stales retained voice by appearance changes', async () => {
  const snapshot = { ...phrase, textId: phrase.id, kind: 'microphone' as const };
  const scene = { ...createReviewCaptionSettings(), enabled: true };
  scene.style.position = 'top';
  function Phrase() {
    const [fragment, setFragment] = useState(phrase);
    return (
      <>
        <output>{JSON.stringify(fragment)}</output>
        <ReviewTextPhrase
          fragment={fragment}
          expanded
          busy={false}
          limit={10}
          onJump={vi.fn()}
          editor={{
            endTyping: vi.fn(),
            captions: scene,
            playhead: () => 0,
            split: vi.fn(),
            merge: vi.fn(),
            remove: vi.fn(),
            change: (id, patch) => {
              const result = editReviewTextFragment(
                { version: 1, fragments: [fragment] },
                id,
                patch
              );
              if (result.ok) setFragment(result.document.fragments[0]!);
              return result.ok;
            },
          }}
        />
      </>
    );
  }
  await act(async () => root.render(<Phrase />));
  const group = host.querySelector<HTMLDetailsElement>('details')!;
  const groups = host.querySelectorAll('details').length;
  expect(group).not.toBeNull();
  const switches = () => [...host.querySelectorAll<HTMLButtonElement>('[role="switch"]')];
  expect(switches()).toHaveLength(2);
  act(() => switches()[1]!.click());
  let fragment = JSON.parse(host.querySelector('output')!.textContent!) as ReviewTextFragment;
  expect(fragment.style?.position).toBe('top');
  const sizeInput = host.querySelector<HTMLInputElement>('fieldset input[type="range"]')!;
  expect(sizeInput).not.toBeNull();
  act(() => sizeInput.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(sizeInput, '8');
    sizeInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => sizeInput.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
  fragment = JSON.parse(host.querySelector('output')!.textContent!) as ReviewTextFragment;
  expect(fragment.style?.fontSize).toBe(0.08);
  expect(reviewVoiceTextStatus(fragment, snapshot)).toBe('current');
  act(() => switches()[1]!.click());
  fragment = JSON.parse(host.querySelector('output')!.textContent!) as ReviewTextFragment;
  expect(fragment.style).toBeUndefined();
  act(() => switches()[0]!.click());
  fragment = JSON.parse(host.querySelector('output')!.textContent!) as ReviewTextFragment;
  expect(fragment.showInVideo).toBe(false);
  expect(host.querySelectorAll('details')).toHaveLength(groups - 1);
  expect(fragment.revision).toBe(0);
  expect(fragment.timingRevision).toBe(0);
  expect(reviewVoiceTextStatus(fragment, snapshot)).toBe('current');
});

it('guards caption navigation and preserves ordinary timeline navigation', async () => {
  let allow = true;
  let controller!: ReturnType<typeof useReviewText>;
  const select = vi.fn(),
    seek = vi.fn(),
    pause = vi.fn(),
    setText = vi.fn();
  function Hook() {
    controller = useReviewText({
      document: { version: 1, fragments: [phrase] },
      sourceDuration: 10,
      edits: [],
      sourceTime: 0,
      select,
      seek,
      pause,
      setText,
      beforeAction: (action) => {
        if (allow) action();
      },
    });
    return null;
  }
  await act(async () => root.render(<Hook />));
  act(() => controller.jump(phrase));
  expect(select).not.toHaveBeenCalled();
  expect(seek).toHaveBeenCalledExactlyOnceWith(0, false);
  act(() => controller.jump(phrase, true));
  expect(select).toHaveBeenCalledExactlyOnceWith({ kind: 'text', id: phrase.id });
  allow = false;
  select.mockClear();
  seek.mockClear();
  pause.mockClear();
  act(() => controller.jump(phrase, true));
  expect(select).not.toHaveBeenCalled();
  expect(seek).not.toHaveBeenCalled();
  expect(pause).not.toHaveBeenCalled();
  expect(setText).not.toHaveBeenCalled();
});
