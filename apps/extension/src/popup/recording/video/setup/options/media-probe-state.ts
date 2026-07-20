export type InactiveMediaProbeState = {
  capabilities: null;
  settings: null;
  status: 'error' | 'idle' | 'loading';
  stream: null;
};

export function createInactiveMediaProbeState(
  status: InactiveMediaProbeState['status']
): InactiveMediaProbeState {
  return { capabilities: null, settings: null, status, stream: null };
}

export function stopMediaProbeStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}
