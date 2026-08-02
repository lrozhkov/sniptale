type AudioAmplitudeBarsProps = {
  active: boolean;
  className?: string;
  peaks: readonly number[];
  soundDetected: boolean;
};

function normalizePeak(peak: number): number {
  return Number.isFinite(peak) ? Math.max(0, Math.min(1, peak)) : 0;
}

export function AudioAmplitudeBars({
  active,
  className = '',
  peaks,
  soundDetected,
}: AudioAmplitudeBarsProps) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center gap-1 ${className}`}
      data-ui="audio.amplitude-bars"
    >
      {peaks.map((peak, index) => {
        const normalizedPeak = normalizePeak(peak);
        return (
          <span
            className={[
              'h-full w-1.5 shrink-0 origin-center rounded-full',
              'transition-[transform,opacity] duration-100 ease-out',
              'motion-reduce:transition-none',
              soundDetected
                ? 'bg-[var(--sniptale-color-accent)]'
                : 'bg-[var(--sniptale-color-text-muted)]',
            ].join(' ')}
            data-audio-peak={index}
            key={index}
            style={{
              opacity: soundDetected ? 0.92 : active ? 0.34 : 0.18,
              transform: `scaleY(${Math.max(0.1, normalizedPeak)})`,
            }}
          />
        );
      })}
    </div>
  );
}
