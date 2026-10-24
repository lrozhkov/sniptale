import {
  VOICE_HISTORY_MAX_AUDIO_BYTES,
  VOICE_HISTORY_MAX_DURATION_SECONDS,
} from '@sniptale/runtime-contracts/voice-input';
import type { VoiceAudioInput } from './audio-input';

export type VoiceAudioCapture = {
  finish(): Promise<VoiceAudioInput>;
  abort(): void;
};

/** Borrows the selected track. The recognition run alone owns hardware release. */
export function createVoiceAudioCapture(
  track: MediaStreamTrack,
  onLimit: () => void
): VoiceAudioCapture {
  const mimeType = 'audio/webm;codecs=opus';
  const recorder = new MediaRecorder(new MediaStream([track]), { mimeType });
  const chunks: Blob[] = [];
  const startedAt = performance.now();
  let size = 0;
  let aborted = false;
  let completed = false;
  let overflow = false;
  let resolve!: (value: VoiceAudioInput) => void;
  let reject!: (reason: Error) => void;
  const completion = new Promise<VoiceAudioInput>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // Abort and native error can precede the consumer's Stop call.
  void completion.catch(() => undefined);
  const cleanup = () => {
    recorder.ondataavailable = null;
    recorder.onerror = null;
    recorder.onstop = null;
  };
  recorder.ondataavailable = (event) => {
    if (aborted || completed || !event.data.size) return;
    size += event.data.size;
    if (size > VOICE_HISTORY_MAX_AUDIO_BYTES) {
      overflow = true;
      onLimit();
      return;
    }
    chunks.push(event.data);
  };
  recorder.onerror = () => {
    if (completed) return;
    completed = true;
    cleanup();
    reject(new Error('unexpected'));
    onLimit();
  };
  recorder.onstop = () => {
    if (completed) return;
    completed = true;
    cleanup();
    if (aborted) {
      reject(new Error('aborted'));
      return;
    }
    const durationSeconds = Math.min(
      (performance.now() - startedAt) / 1000,
      VOICE_HISTORY_MAX_DURATION_SECONDS
    );
    if (overflow) {
      reject(new Error('too-large'));
      return;
    }
    if (!size || durationSeconds <= 0) {
      reject(new Error('no-speech'));
      return;
    }
    resolve({ audio: new Blob(chunks, { type: mimeType }), durationSeconds });
  };
  recorder.start(250);
  return {
    finish() {
      if (!completed && recorder.state !== 'inactive') recorder.stop();
      return completion;
    },
    abort() {
      if (completed) return;
      aborted = true;
      completed = true;
      cleanup();
      if (recorder.state !== 'inactive') recorder.stop();
      chunks.length = 0;
      reject(new Error('aborted'));
    },
  };
}
