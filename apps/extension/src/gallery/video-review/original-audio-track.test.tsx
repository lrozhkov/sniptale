// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewOriginalAudioTrack } from './original-audio-track';
import { ReviewOriginalAudioInspector } from './original-audio-inspector';
import { useReviewAudio } from './use-review-audio';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewEdit } from '../../features/video/review/types';
import { translate } from '../../platform/i18n';

vi.mock('../../composition/persistence/media-library', () => ({
  listMediaLibrary: async () => [],
}));

function setup() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onRange = vi.fn();
  const onSelectSpeed = vi.fn();
  const speed: ReviewEdit = {
    id: 'speed',
    kind: 'speed',
    start: 7,
    end: 9,
    requestedStart: 7,
    requestedEnd: 9,
    rate: 2,
    audio: 'mute',
  };
  let editor!: ReturnType<typeof useReviewAudio>;
  let busy = false;
  function Harness() {
    const [audio, setAudio] = useState(createQuickEditAdvancedState().audio);
    const [selectedOriginalId, onOriginalSelection] = useState<string | null>(null);
    editor = useReviewAudio({
      audio,
      setAudio,
      timelineDuration: 10,
      sourceDuration: 10,
      edits: [speed],
      selectedOriginalId,
      onOriginalSelection,
    });
    return (
      <>
        <ReviewOriginalAudioTrack
          original={audio.original}
          duration={10}
          editor={editor}
          busy={busy}
          edits={[speed]}
          onOriginal={editor.setOriginal}
          onRange={onRange}
          onSelectSpeed={onSelectSpeed}
        />
        <ReviewOriginalAudioInspector audio={editor} duration={10} speedMuted />
      </>
    );
  }
  act(() => root.render(<Harness />));
  const lane = host.querySelector<HTMLElement>('[data-original-audio-lane]')!;
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 32));
  lane.setPointerCapture = vi.fn();
  lane.releasePointerCapture = vi.fn();
  const send = (type: string, x: number, target: Element = lane, button = 0) =>
    act(() => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      target.dispatchEvent(event);
    });
  return {
    host,
    lane,
    onRange,
    onSelectSpeed,
    send,
    get editor() {
      return editor;
    },
    setBusy(value: boolean) {
      busy = value;
      act(() => root.render(<Harness />));
    },
    close() {
      act(() => root.unmount());
      host.remove();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
}

it('draws in source time, trims both edges, cancels gestures and follows a linked speed mute', () => {
  const f = setup();
  try {
    f.send('pointermove', 50);
    f.send('pointerup', 50);
    f.send('pointerdown', 200, f.lane, 2);
    f.send('pointerup', 400);
    expect(f.onRange).not.toHaveBeenCalled();
    act(() => f.editor.setOriginalTool(true));
    f.send('pointerdown', 200);
    f.send('pointermove', 500);
    f.send('pointerup', 500);
    expect(f.editor.selectedOriginal).toMatchObject({ start: 2, end: 5, volume: 0 });
    const range = () =>
      f.host.querySelector<HTMLButtonElement>(
        '[data-ui="gallery.videoReview.originalAudioRange"]'
      )!;
    f.send('pointerdown', 350, range());
    act(() => range().click());
    f.send('pointerdown', 200, range().querySelector('[data-audio-edge="start"]')!);
    f.send('pointermove', 100);
    f.send('pointerup', 100);
    expect(f.editor.selectedOriginal!.start).toBe(1);
    f.send('pointerdown', 500, range().querySelector('[data-audio-edge="end"]')!);
    f.send('pointermove', 600);
    f.send('pointerup', 600);
    expect(f.editor.selectedOriginal!.end).toBe(6);
    for (const cancel of ['pointercancel', 'lostpointercapture', 'Escape']) {
      f.send('pointerdown', 100, range().querySelector('[data-audio-edge="start"]')!);
      f.send('pointermove', 0);
      if (cancel === 'Escape')
        act(() =>
          document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'Escape' }))
        );
      else f.send(cancel, 0);
      f.send('pointerup', 0);
      expect(f.editor.selectedOriginal!.start).toBe(1);
    }
    const linked = f.host.querySelector<HTMLButtonElement>(
      '[data-ui="gallery.videoReview.speedAudioMute"]'
    )!;
    f.send('pointerdown', 800, linked);
    act(() => linked.click());
    expect(f.onSelectSpeed).toHaveBeenCalledWith(expect.objectContaining({ id: 'speed' }));
    f.setBusy(true);
    f.send('pointerdown', 650);
    f.send('pointerup', 690);
    expect(range().disabled).toBe(true);
  } finally {
    f.close();
  }
});

it('requires the audio tool for drawing, ignores overlapping ranges and edits inspector gain', () => {
  const f = setup();
  try {
    f.send('pointerdown', 200);
    f.send('pointerup', 200);
    expect(f.onRange).not.toHaveBeenCalled();
    f.send('pointerdown', 500);
    f.send('pointermove', 200);
    f.send('pointerup', 200);
    expect(f.onRange).not.toHaveBeenCalled();
    expect(f.editor.selectedOriginal).toBeNull();
    act(() => f.editor.addOriginal({ kind: 'range', start: 2, end: 5 }));
    const id = f.editor.selectedOriginal!.id;
    act(() => {
      f.editor.addOriginal({ kind: 'range', start: 3, end: 4 });
      f.editor.patchOriginal(id, { end: 1 });
    });
    expect(f.editor.selectedOriginal).toMatchObject({ start: 2, end: 5 });
    const change = (label: string, value: string) => {
      const input = f.host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      expect(input).not.toBeNull();
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          value
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      act(() =>
        input.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })
        )
      );
    };
    change(translate('gallery.videoReview.volume'), '150');
    expect(f.editor.selectedOriginal!.volume).toBe(1.5);
    const block = f.host.querySelector<HTMLElement>(
      '[data-ui="gallery.videoReview.originalAudioRange"]'
    )!;
    expect(block.textContent).toBe('150%');
    expect(block.className).not.toContain('sniptale-color-danger');
    change(translate('gallery.videoReview.rangeStart'), '1');
    change(translate('gallery.videoReview.rangeEnd'), '6');
    expect(f.editor.selectedOriginal).toMatchObject({ start: 1, end: 6 });
    act(() =>
      f.host
        .querySelector<HTMLButtonElement>(
          `button[aria-label="${translate('gallery.videoReview.muteAudioRange')}"]`
        )!
        .click()
    );
    expect(f.editor.selectedOriginal!.volume).toBe(0);
    expect(block.textContent).toBe('');
    expect(block.className).toContain('var(--sniptale-color-danger)_12%');
    expect(block.className).toContain('border-[var(--sniptale-color-accent)]');
    act(() =>
      f.host
        .querySelector<HTMLButtonElement>(
          `button[aria-label="${translate('gallery.videoReview.audioEnabled')}"]`
        )!
        .click()
    );
    expect(f.host.querySelector('[data-original-audio-lane] svg')?.getAttribute('style')).toContain(
      '0.2'
    );
    act(() =>
      f.host
        .querySelector<HTMLButtonElement>(
          `button[aria-label="${translate('gallery.videoReview.removeEdit')}"]`
        )!
        .click()
    );
    expect(f.editor.selectedOriginal).toBeNull();
  } finally {
    f.close();
  }
});

it('moves the range body without changing duration and bounds movement by neighbors', () => {
  const f = setup();
  try {
    act(() => f.editor.addOriginal({ kind: 'range', start: 2, end: 4 }));
    const id = f.editor.selectedOriginal!.id;
    act(() => f.editor.addOriginal({ kind: 'range', start: 6, end: 7 }));
    const range = f.host.querySelector('[data-ui="gallery.videoReview.originalAudioRange"]')!;
    f.send('pointerdown', 300, range);
    f.send('pointermove', 500);
    f.send('pointerup', 500);
    expect(f.editor.selectedOriginal).toMatchObject({ id, start: 4, end: 6 });
    f.send('pointerdown', 500, range);
    f.send('pointermove', 950);
    f.send('pointerup', 950);
    expect(f.editor.selectedOriginal).toMatchObject({ id, start: 4, end: 6 });
    f.send('pointerdown', 500, range);
    f.send('pointermove', 0);
    f.send('pointerup', 0);
    expect(f.editor.selectedOriginal).toMatchObject({ id, start: 0, end: 2 });
  } finally {
    f.close();
  }
});
