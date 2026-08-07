import { Droplet, Focus, Square } from 'lucide-react';
import type { EffectMode } from '@sniptale/ui/highlighter-style/types';

export function FrameAnnotationEffectIcon(props: { mode: EffectMode; size: number }) {
  const iconProps = { 'aria-hidden': true, size: props.size, style: { display: 'block' } } as const;
  if (props.mode === 'border') return <Square {...iconProps} />;
  if (props.mode === 'blur') return <Droplet {...iconProps} />;
  return <Focus {...iconProps} />;
}
