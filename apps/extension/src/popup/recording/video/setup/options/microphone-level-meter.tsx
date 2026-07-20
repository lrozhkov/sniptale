import { useEffect, useState } from 'react';
import { translate } from '../../../../../platform/i18n';

const METER_CLASS_NAME = 'h-2 overflow-hidden rounded-full bg-[var(--sniptale-color-border-soft)]';

function calculateRms(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }

  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 3);
}

function startLevelMeter({
  onLevel,
  stream,
}: {
  onLevel: (level: number) => void;
  stream: MediaStream;
}): () => void {
  const AudioContextCtor = window.AudioContext;
  const audioContext = new AudioContextCtor();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let frame = 0;

  const tick = () => {
    analyser.getFloatTimeDomainData(samples);
    onLevel(calculateRms(samples));
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    source.disconnect();
    analyser.disconnect();
    void audioContext.close();
  };
}

export function MicrophoneLevelMeter({ stream }: { stream: MediaStream | null }) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream) {
      setLevel(0);
      return undefined;
    }

    return startLevelMeter({ stream, onLevel: setLevel });
  }, [stream]);

  return (
    <div className="grid gap-1">
      <div className="text-[10px] text-[var(--sniptale-color-text-muted-strong)]">
        {translate('popup.video.microphoneLevelLabel')}
      </div>
      <div className={METER_CLASS_NAME}>
        <div
          className={['h-full transition-[width,background-color]', resolveLevelColor(level)].join(
            ' '
          )}
          style={{ width: `${Math.round(level * 100)}%` }}
        />
      </div>
    </div>
  );
}

function resolveLevelColor(level: number): string {
  if (level > 0.72) {
    return 'bg-[var(--sniptale-color-danger)]';
  }
  if (level > 0.42) {
    return 'bg-[var(--sniptale-color-warning)]';
  }
  return 'bg-[var(--sniptale-color-success)]';
}
