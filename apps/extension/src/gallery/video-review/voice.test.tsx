// @vitest-environment jsdom
import { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { VoiceInputServerEvent } from '@sniptale/runtime-contracts/voice-input';
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
