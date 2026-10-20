/** Maps microphone RMS to a visual scale from -60 dBFS to 0 dBFS. */
export function getMicrophoneMeterLevel(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0.001) return 0;
  return Math.min(1, (20 * Math.log10(Math.min(1, rms)) + 60) / 60);
}

/** Displays a borrowed microphone measurement without acquiring audio resources. */
export function MicrophoneMeter({
  dataUi,
  label,
  level,
}: {
  dataUi?: string;
  label: string;
  level: number;
}) {
  const inputLevel = Number.isFinite(level) ? level : 0;
  const visualLevel = getMicrophoneMeterLevel(inputLevel);
  const color =
    inputLevel >= 0.89
      ? 'bg-[var(--sniptale-color-danger)]'
      : inputLevel >= 0.25
        ? 'bg-[var(--sniptale-color-warning)]'
        : 'bg-[var(--sniptale-color-success)]';
  return (
    <div
      role="meter"
      data-ui={dataUi}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(visualLevel * 100)}
      className="h-1.5 overflow-hidden rounded-full bg-[var(--sniptale-color-border-soft)]"
    >
      <div
        className={[
          'h-full w-full origin-left transition-[transform,background-color] duration-100 ease-out',
          'motion-reduce:transition-none',
          color,
        ].join(' ')}
        style={{ transform: `scaleX(${visualLevel})` }}
      />
    </div>
  );
}
