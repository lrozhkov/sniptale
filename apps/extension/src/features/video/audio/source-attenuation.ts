/** A half-open gain interval in the caller's time domain. */
export interface AudioGainRange {
  start: number;
  end: number;
  volume: number;
}
type GainEvent = { at: number; volume: number; direction: -1 | 1; manual: boolean };

/** Composes disjoint authored manual ranges with minimum overlapping attenuation. */
export function composeSourceAudioRanges(
  manual: readonly AudioGainRange[],
  attenuation: readonly AudioGainRange[]
): AudioGainRange[] {
  const events: GainEvent[] = [
    ...manual.flatMap((range): GainEvent[] => [
      { at: range.start, volume: range.volume, direction: 1, manual: true },
      { at: range.end, volume: range.volume, direction: -1, manual: true },
    ]),
    ...attenuation.flatMap((range): GainEvent[] => [
      { at: range.start, volume: range.volume, direction: 1, manual: false },
      { at: range.end, volume: range.volume, direction: -1, manual: false },
    ]),
  ];
  events.sort((a, b) => a.at - b.at || a.direction - b.direction);
  const active = new Map<number, number>();
  const ranges: AudioGainRange[] = [];
  let manualGain = 1;
  let index = 0;
  while (index < events.length) {
    const at = events[index]!.at;
    while (index < events.length && events[index]!.at === at) {
      const event = events[index++]!;
      if (event.manual) manualGain = event.direction === 1 ? event.volume : 1;
      else {
        const count = (active.get(event.volume) ?? 0) + event.direction;
        if (count === 0) active.delete(event.volume);
        else active.set(event.volume, count);
      }
    }
    const end = events[index]?.at;
    const attenuation = active.has(0) ? 0 : Math.min(1, ...active.keys());
    const volume = manualGain * attenuation;
    if (end === undefined || end <= at || volume === 1) continue;
    const previous = ranges.at(-1);
    if (previous?.end === at && previous.volume === volume) previous.end = end;
    else ranges.push({ start: at, end, volume });
  }
  return ranges;
}

/** Resolves half-open projection cells without changing authored gain data. */
export function sourceAudioAttenuationAtTime(ranges: readonly AudioGainRange[], time: number) {
  let volume = 1;
  for (const range of ranges)
    if (time >= range.start && time < range.end) volume = Math.min(volume, range.volume);
  return volume;
}
