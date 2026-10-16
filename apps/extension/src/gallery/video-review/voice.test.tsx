// @vitest-environment jsdom
import { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { VoiceInputServerEvent } from '@sniptale/runtime-contracts/voice-input';
import type { ReviewAnnotation } from '../../features/video/review/types';
import { InspectorLayout } from '../../ui/compact-inspector-controls/layout';
const harness = vi.hoisted(() => ({
  transcript: null as
    | null
    | ((event: Extract<VoiceInputServerEvent, { type: 'VOICE_INPUT_TRANSCRIPT' }>) => void),
  stop: vi.fn(),
  start: vi.fn(),
}));
vi.mock('../../composition/voice-input/session', () => ({
  useVoiceInputSession: (args: { onTranscript: typeof harness.transcript }) => {
    harness.transcript = args.onTranscript;
    return {
      state: { active: false, phase: 'idle', errorCode: null, audioLevel: 0 },
      actions: { start: harness.start, stop: harness.stop },
    };
  },
}));
vi.mock('../../composition/voice-input/trusted-events', () => ({
  isTrustedMouseEvent: () => true,
  isTrustedPointerEvent: () => true,
}));
import { ReviewComposer } from './composer';
import { useReviewVoice } from './voice';
it('inserts only final fragments once, preserves consecutive events, and rejects late composer speech', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  let voice!: ReturnType<typeof useReviewVoice>;
  let text = '';
  function Harness({ id }: { id: string }) {
    const [value, setValue] = useState('');
    text = value;
    voice = useReviewVoice({
      annotation: { id, text: value, anchor: { kind: 'point', time: 0 } },
      textarea: useRef(null),
      onText: setValue,
    });
    return null;
  }
  const emit = (sequence: number, value: string, isFinal = true) =>
    harness.transcript?.({
      type: 'VOICE_INPUT_TRANSCRIPT',
      sessionId: 'session',
      sequence,
      text: value,
      isFinal,
      confidence: 1,
    });
  try {
    act(() => root.render(<Harness id="a" />));
    act(() => voice.start());
    act(() => {
      emit(0, 'interim', false);
      emit(1, 'One ');
      emit(1, 'duplicate');
      emit(2, 'two');
    });
    expect(text).toBe('One two');
    act(() => root.render(<Harness id="b" />));
    act(() => emit(3, 'late'));
    expect(text).toBe('One two');
    act(() => voice.stop());
    act(() => emit(4, 'after stop'));
    expect(text).toBe('One two');
    expect(harness.stop).toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('clears the review draft, stops dictation, and rejects a final transcript after Clear', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  harness.start.mockClear();
  harness.stop.mockClear();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const save = vi.fn();
  const discard = vi.fn();
  const leave = vi.fn();
  function Harness() {
    const [annotation, setAnnotation] = useState<ReviewAnnotation>({
      id: 'comment',
      text: 'Draft ',
      anchor: { kind: 'point', time: 0 },
    });
    return (
      <InspectorLayout>
        <ReviewComposer
          annotation={annotation}
          busy={false}
          onChange={setAnnotation}
          onSave={save}
          onDiscard={discard}
          onLeave={leave}
        />
      </InspectorLayout>
    );
  }
  const emit = (sequence: number, text: string) =>
    harness.transcript?.({
      type: 'VOICE_INPUT_TRANSCRIPT',
      sessionId: 'session',
      sequence,
      text,
      isFinal: true,
      confidence: 1,
    });
  try {
    act(() => root.render(<Harness />));
    const field = host.querySelector<HTMLTextAreaElement>('textarea')!;
    field.setSelectionRange(field.value.length, field.value.length);
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-ui="gallery.videoReview.voice"]')!.click()
    );
    expect(harness.start).toHaveBeenCalledTimes(1);
    act(() => emit(0, 'one '));
    act(() => emit(1, 'two'));
    expect(field.value).toBe('Draft one two');
    expect(harness.stop).not.toHaveBeenCalled();
    act(() => host.querySelector<HTMLButtonElement>('.sniptale-field-clear')!.click());
    expect(field.value).toBe('');
    expect(document.activeElement).toBe(field);
    act(() => emit(2, 'late final'));
    expect(field.value).toBe('');
    expect(document.activeElement).toBe(field);
    expect(harness.stop).toHaveBeenCalledTimes(1);
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-ui="gallery.videoReview.voice"]')!.click()
    );
    act(() => emit(3, 'New take'));
    expect(field.value).toBe('New take');
    expect(harness.start).toHaveBeenCalledTimes(2);
    expect(save).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
    expect(leave).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
