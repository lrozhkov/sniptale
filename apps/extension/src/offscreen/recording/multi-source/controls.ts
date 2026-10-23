import type { MultiSourceSession } from './state';

export function pauseSessionRecorders(session: MultiSourceSession | null): void {
  session?.audioRecorder?.microphoneActivity?.setPhase('paused');
  session?.recorders.forEach((source) => {
    if (source.recorder.state === 'recording') {
      source.recorder.pause();
    }
  });
  if (session?.audioRecorder?.recorder.state === 'recording') {
    session.audioRecorder.recorder.pause();
  }
  if (session?.webcamRecorder?.recorder.state === 'recording') {
    session.webcamRecorder.recorder.pause();
  }
}

export function resumeSessionRecorders(session: MultiSourceSession | null): void {
  session?.audioRecorder?.microphoneActivity?.setPhase('recording');
  session?.recorders.forEach((source) => {
    if (source.recorder.state === 'paused') {
      source.recorder.resume();
    }
  });
  if (session?.audioRecorder?.recorder.state === 'paused') {
    session.audioRecorder.recorder.resume();
  }
  if (session?.webcamRecorder?.recorder.state === 'paused') {
    session.webcamRecorder.recorder.resume();
  }
}

export function setSessionMediaEnabled(
  session: MultiSourceSession | null,
  patch: { microphoneEnabled?: boolean; microphoneGain?: number; webcamEnabled?: boolean }
): void {
  if (patch.microphoneGain !== undefined) {
    session?.audioRecorder?.setMicrophoneGain?.(patch.microphoneGain);
  }
  if (patch.microphoneEnabled !== undefined) {
    session?.audioRecorder?.microphoneActivity?.setEnabled(patch.microphoneEnabled);
    session?.audioRecorder?.stream.getAudioTracks().forEach((track) => {
      track.enabled = patch.microphoneEnabled === true;
    });
  }

  if (patch.webcamEnabled !== undefined) {
    session?.webcamRecorder?.stream.getVideoTracks().forEach((track) => {
      track.enabled = patch.webcamEnabled === true;
    });
  }
}
