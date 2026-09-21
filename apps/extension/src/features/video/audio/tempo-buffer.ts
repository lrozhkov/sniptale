import { createTempoProcessor } from './tempo';

/** Materializes an explicitly retimed clip, yielding between bounded chunks for cancellation. */
export async function renderTempoBuffer(
  source: AudioBuffer,
  options: { start: number; duration: number; rate: number },
  signal?: AbortSignal
): Promise<AudioBuffer> {
  signal?.throwIfAborted();
  const { sampleRate, numberOfChannels } = source;
  const processor = createTempoProcessor(sampleRate, numberOfChannels, options.rate);
  const length = Math.max(1, Math.round((options.duration / options.rate) * sampleRate));
  const result = new AudioBuffer({ length, sampleRate, numberOfChannels });
  const planes = Array.from({ length: numberOfChannels }, (_, c) => source.getChannelData(c));
  const offset = Math.round(options.start * sampleRate);
  const end = Math.min(source.length, offset + Math.round(options.duration * sampleRate));
  const read = (channel: number, frame: number) =>
    frame >= 0 && frame + offset >= 0 && frame + offset < end
      ? planes[channel]![frame + offset]!
      : 0;
  for (let frame = 0; frame < length; frame += sampleRate) {
    signal?.throwIfAborted();
    const count = Math.min(sampleRate, length - frame);
    const chunk = processor.render(read, count);
    for (let c = 0; c < numberOfChannels; c++) result.getChannelData(c).set(chunk[c]!, frame);
    if (frame + count < length) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  signal?.throwIfAborted();
  return result;
}
