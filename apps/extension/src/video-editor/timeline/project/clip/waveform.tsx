import type { AudioClipWaveformProps } from '../types';
import { buildAudioClipWaveformPath } from '../canvas/render-data';

function buildEnvelopePath(startValue: number, endValue: number) {
  const startY = 88 - startValue * 38;
  const endY = 88 - endValue * 38;
  return `M 0 ${startY} L 100 ${endY}`;
}

function EmptyAudioClipWaveform({
  envelopeEnd,
  envelopeStart,
  muted,
}: Pick<AudioClipWaveformProps, 'envelopeEnd' | 'envelopeStart' | 'muted'>) {
  const mutedClassName = 'absolute inset-x-1 top-1/2 h-px -translate-y-1/2 rounded-full';
  const quietLineClassName =
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-text-primary)_20%,transparent)]';
  const activeLineClassName = [
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-text-primary)_42%,transparent)]',
    'shadow-[0_0_14px_color-mix(in_srgb,var(--sniptale-color-text-primary)_18%,transparent)]',
  ].join(' ');

  return (
    <>
      <div
        className={
          muted
            ? `${mutedClassName} ${quietLineClassName}`
            : `${mutedClassName} ${activeLineClassName}`
        }
      />
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <path
          d={buildEnvelopePath(envelopeStart, envelopeEnd)}
          fill="none"
          stroke="color-mix(in_srgb,var(--sniptale-color-accent)_72%,white)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity={muted ? 0.28 : 0.64}
        />
      </svg>
    </>
  );
}

function WaveformShape({ muted, path }: { muted: boolean; path: string }) {
  const waveformClassName = muted
    ? 'h-full w-full text-[color:color-mix(in_srgb,var(--sniptale-color-text-primary)_24%,transparent)]'
    : 'h-full w-full text-[color:color-mix(in_srgb,var(--sniptale-color-text-primary)_66%,transparent)]';

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={waveformClassName}
      aria-hidden="true"
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}

function EnvelopeOverlay({ envelopePath, muted }: { envelopePath: string; muted: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <path
        d={envelopePath}
        fill="none"
        stroke="color-mix(in_srgb,var(--sniptale-color-accent)_78%,white)"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity={muted ? 0.3 : 0.82}
      />
    </svg>
  );
}

export function AudioClipWaveform({
  envelopeEnd,
  envelopeStart,
  peaks,
  muted,
}: AudioClipWaveformProps) {
  const envelopePath = buildEnvelopePath(envelopeStart, envelopeEnd);
  if (peaks.length === 0) {
    return (
      <EmptyAudioClipWaveform
        envelopeEnd={envelopeEnd}
        envelopeStart={envelopeStart}
        muted={muted}
      />
    );
  }

  const waveformPath = buildAudioClipWaveformPath(peaks);

  return (
    <div className="relative h-full w-full">
      <WaveformShape muted={muted} path={waveformPath} />
      <EnvelopeOverlay envelopePath={envelopePath} muted={muted} />
    </div>
  );
}
