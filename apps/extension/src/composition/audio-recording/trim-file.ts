/** Encode the chosen interval as PCM so a material has the same bounds as its preview. */
export async function createTrimmedRecordingFile(
  blob: Blob,
  start: number,
  end: number
): Promise<File> {
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const first = Math.max(0, Math.floor(start * audio.sampleRate));
    const last = Math.min(audio.length, Math.ceil(end * audio.sampleRate));
    if (last <= first) throw new Error('Empty recording interval');
    const channels = audio.numberOfChannels;
    const size = (last - first) * channels * 2;
    const buffer = new ArrayBuffer(44 + size);
    const view = new DataView(buffer);
    const tag = (offset: number, text: string) =>
      [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    tag(0, 'RIFF');
    view.setUint32(4, 36 + size, true);
    tag(8, 'WAVE');
    tag(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, audio.sampleRate, true);
    view.setUint32(28, audio.sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    tag(36, 'data');
    view.setUint32(40, size, true);
    const samples = Array.from({ length: channels }, (_, channel) => audio.getChannelData(channel));
    let offset = 44;
    for (let frame = first; frame < last; frame++) {
      for (const channel of samples) {
        const sample = Math.max(-1, Math.min(1, channel[frame]!));
        view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
        offset += 2;
      }
    }
    return new File([buffer], `audio-${Date.now()}.wav`, { type: 'audio/wav' });
  } finally {
    await context.close();
  }
}
