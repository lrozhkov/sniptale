/** PCM reader in source-frame coordinates; out-of-range samples must be zero. */
type TempoSampleReader = (channel: number, frame: number) => number;

/**
 * Stateful waveform-similarity overlap/add. One alignment is shared by all channels.
 * The nominal source clock never accumulates alignment offsets, preventing drift.
 * Call inputRange before render to load a bounded source window; retain the processor
 * across output chunks and reset it only at an actual edit boundary.
 */
export function createTempoProcessor(sampleRate: number, channels: number, rate: number) {
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 192000 ||
    !Number.isInteger(channels) ||
    channels < 1 ||
    channels > 8 ||
    !Number.isFinite(rate) ||
    rate < 0.0625 ||
    rate > 16
  )
    throw new RangeError('Invalid tempo parameters');
  const hop = Math.round(sampleRate * 0.02);
  const search = Math.round(sampleRate * 0.012);
  const tail = Array.from({ length: channels }, () => new Float32Array(hop));
  let nextGrain = 0;
  let pending = Array.from({ length: channels }, () => new Float32Array(0));
  let pendingOffset = 0;
  let outputFrame = 0;

  const makeGrain = (read: TempoSampleReader) => {
    const nominal = Math.round(nextGrain * hop * rate);
    const start = nextGrain === 0 ? 0 : findAlignment(read, tail, nominal, search, hop);
    const grain = Array.from({ length: channels }, () => new Float32Array(hop));
    for (let i = 0; i < hop; i++) {
      const weight = nextGrain === 0 ? 1 : 0.5 - 0.5 * Math.cos((Math.PI * i) / hop);
      for (let channel = 0; channel < channels; channel++) {
        grain[channel]![i] = tail[channel]![i]! * (1 - weight) + read(channel, start + i) * weight;
        tail[channel]![i] = read(channel, start + hop + i);
      }
    }
    nextGrain++;
    return grain;
  };
  return {
    inputRange(count: number) {
      if (!Number.isSafeInteger(count) || count < 1) throw new RangeError('Invalid output length');
      if (rate === 1) return { start: outputFrame, end: outputFrame + count };
      const grains = Math.ceil(Math.max(0, count - (pending[0]!.length - pendingOffset)) / hop);
      return {
        start: Math.max(0, Math.round(nextGrain * hop * rate) - search),
        end: Math.round((nextGrain + Math.max(0, grains - 1)) * hop * rate) + search + 2 * hop,
      };
    },
    render(read: TempoSampleReader, count: number): Float32Array<ArrayBuffer>[] {
      if (!Number.isSafeInteger(count) || count < 1) throw new RangeError('Invalid output length');
      const result = Array.from({ length: channels }, () => new Float32Array(count));
      if (rate === 1) {
        for (let c = 0; c < channels; c++)
          for (let i = 0; i < count; i++) result[c]![i] = read(c, outputFrame + i);
      } else {
        let written = 0;
        while (written < count) {
          if (pendingOffset === pending[0]!.length) {
            pending = makeGrain(read);
            pendingOffset = 0;
          }
          const size = Math.min(count - written, hop - pendingOffset);
          for (let c = 0; c < channels; c++)
            result[c]!.set(pending[c]!.subarray(pendingOffset, pendingOffset + size), written);
          pendingOffset += size;
          written += size;
        }
      }
      outputFrame += count;
      return result;
    },
  };
}

function findAlignment(
  read: TempoSampleReader,
  tail: Float32Array[],
  nominal: number,
  search: number,
  hop: number
) {
  let energy = 0;
  for (const channel of tail) for (let i = 0; i < hop; i += 4) energy += channel[i]! ** 2;
  if (energy < 1e-10) return nominal;
  const score = (start: number) => {
    let dot = 0;
    let power = 0;
    for (let c = 0; c < tail.length; c++) {
      for (let i = 0; i < hop; i += 4) {
        const value = read(c, start + i);
        dot += tail[c]![i]! * value;
        power += value * value;
      }
    }
    return dot / Math.sqrt(energy * power + 1e-20) - (0.01 * Math.abs(start - nominal)) / search;
  };
  let best = nominal;
  let bestScore = score(best);
  const consider = (candidate: number) => {
    const value = score(candidate);
    if (value > bestScore) {
      best = candidate;
      bestScore = value;
    }
  };
  for (let candidate = Math.max(0, nominal - search); candidate <= nominal + search; candidate += 4)
    consider(candidate);
  const coarse = best;
  for (
    let candidate = Math.max(0, nominal - search, coarse - 3);
    candidate <= Math.min(nominal + search, coarse + 3);
    candidate++
  )
    consider(candidate);
  return best;
}
