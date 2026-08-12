export class AudioMixerGraph {
  private audioContext: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private tabSource: MediaStreamAudioSourceNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micGain: GainNode | null = null;
  private silenceSource: ConstantSourceNode | null = null;

  private getInitializedAudioContext(): AudioContext {
    if (!this.audioContext) {
      throw new Error('AudioMixer not initialized');
    }

    return this.audioContext;
  }

  private getInitializedDestination(): MediaStreamAudioDestinationNode {
    if (!this.destination) {
      throw new Error('AudioMixer not initialized');
    }

    return this.destination;
  }

  async initialize(): Promise<void> {
    if (this.audioContext) {
      return;
    }

    this.audioContext = new AudioContext({
      latencyHint: 'interactive',
      sampleRate: 48000,
    });

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.destination = this.audioContext.createMediaStreamDestination();
    this.silenceSource = this.audioContext.createConstantSource();
    this.silenceSource.offset.value = 0;
    this.silenceSource.connect(this.destination);
    this.silenceSource.start();
  }

  connectTabStream(tabStream: MediaStream): void {
    this.disconnectTabStream();
    this.tabSource = this.getInitializedAudioContext().createMediaStreamSource(tabStream);
    this.tabSource.connect(this.getInitializedDestination());
  }

  connectMicrophoneStream(micStream: MediaStream, gain = 1): void {
    this.disconnectMicrophoneStream();
    const audioContext = this.getInitializedAudioContext();
    this.micSource = audioContext.createMediaStreamSource(micStream);
    if (gain === 1) {
      this.micSource.connect(this.getInitializedDestination());
      return;
    }

    this.micGain = audioContext.createGain();
    this.micGain.gain.value = gain;
    this.micSource.connect(this.micGain);
    this.micGain.connect(this.getInitializedDestination());
  }

  disconnectTabStream(): void {
    if (!this.tabSource) {
      return;
    }

    this.tabSource.disconnect();
    this.tabSource = null;
  }

  disconnectMicrophoneStream(): void {
    if (this.micGain) {
      this.micGain.disconnect();
      this.micGain = null;
    }

    if (!this.micSource) {
      return;
    }

    this.micSource.disconnect();
    this.micSource = null;
  }

  getMixedStream(): MediaStream {
    return this.getInitializedDestination().stream;
  }

  hasAudio(): boolean {
    return this.tabSource !== null || this.micSource !== null;
  }

  async cleanup(): Promise<void> {
    this.disconnectTabStream();
    this.disconnectMicrophoneStream();
    this.silenceSource?.stop();
    this.silenceSource?.disconnect();
    this.silenceSource = null;

    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }

    this.audioContext = null;
    this.destination = null;
  }
}
