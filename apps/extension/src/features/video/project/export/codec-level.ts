/** Codec levels constrain frame size and processing rate even when the hardware supports the family. */
export function resolveVideoCodecLevel(
  codec: string,
  settings: { width: number; height: number; fps: number }
): string {
  const pixels = settings.width * settings.height;
  if (codec.startsWith('avc1')) {
    const blocks = Math.ceil(settings.width / 16) * Math.ceil(settings.height / 16);
    const levels = [
      { level: 31, frame: 3600, rate: 108000 },
      { level: 40, frame: 8192, rate: 245760 },
      { level: 42, frame: 8704, rate: 522240 },
      { level: 50, frame: 22080, rate: 589824 },
      { level: 51, frame: 36864, rate: 983040 },
      { level: 52, frame: 36864, rate: 2073600 },
      { level: 60, frame: 139264, rate: 4177920 },
    ];
    const required = levels.find(
      (entry) => blocks <= entry.frame && blocks * settings.fps <= entry.rate
    );
    const level = Math.max(parseInt(codec.slice(-2), 16), required?.level ?? 62);
    return codec.slice(0, -2) + level.toString(16).padStart(2, '0');
  }
  if (codec.startsWith('hvc1')) {
    const levels = [
      { level: 123, frame: 2228224, rate: 133693440 },
      { level: 150, frame: 8912896, rate: 267386880 },
      { level: 153, frame: 8912896, rate: 534773760 },
      { level: 156, frame: 8912896, rate: 1069547520 },
      { level: 183, frame: 35651584, rate: 2139095040 },
    ];
    const required = levels.find(
      (entry) => pixels <= entry.frame && pixels * settings.fps <= entry.rate
    );
    return codec.replace(/\.L\d+\./, `.L${required?.level ?? 186}.`);
  }
  return codec;
}
