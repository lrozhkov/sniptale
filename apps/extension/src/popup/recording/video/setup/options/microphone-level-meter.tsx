import { useEffect, useRef, useState } from 'react';
import { translate } from '../../../../../platform/i18n/popup';
import { MicrophoneMeter } from '../../microphone-meter';

function calculateRms(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }

  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.min(1, Math.sqrt(sum / samples.length));
}

function startLevelMeter({
  getGain,
  onLevel,
  stream,
}: {
  getGain: () => number;
  onLevel: (level: number) => void;
  stream: MediaStream;
}): () => void {
  const AudioContextCtor = window.AudioContext;
  const audioContext = new AudioContextCtor();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let frame = 0;

  const tick = () => {
    analyser.getFloatTimeDomainData(samples);
    const measuredLevel = Math.min(1, calculateRms(samples) * getGain());
    onLevel(measuredLevel);
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

export function MicrophoneLevelMeter({
  gain,
  stream,
}: {
  gain: number;
  stream: MediaStream | null;
}) {
  const [level, setLevel] = useState(0);
  const gainRef = useRef(gain);
  gainRef.current = gain;

  useEffect(() => {
    if (!stream) {
      setLevel(0);
      return undefined;
    }

    return startLevelMeter({ getGain: () => gainRef.current, stream, onLevel: setLevel });
  }, [stream]);

  return (
    <div className="grid gap-1">
      <div className="text-[10px] text-[var(--sniptale-color-text-muted-strong)]">
        {translate('popup.video.microphoneLevelLabel')}
      </div>
      <MicrophoneMeter label={translate('popup.video.microphoneLevelLabel')} level={level} />
    </div>
  );
}
