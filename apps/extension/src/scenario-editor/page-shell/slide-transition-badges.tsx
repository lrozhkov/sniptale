import { Sparkles, Wand2 } from 'lucide-react';
import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { ValueBadge } from '@sniptale/ui/editor-chrome';
import { translate } from '../../platform/i18n';
import { getBackgroundTransitionLabelKey, getSlideTransitionLabelKey } from '../inspector/labels';

export function ScenarioSlideTransitionBadges(props: { slide: ScenarioSlide }) {
  const transitionKind = props.slide.transition?.kind ?? 'none';
  const backgroundKind = props.slide.backgroundTransition?.kind ?? 'none';

  return (
    <>
      <ValueBadge className="gap-1">
        <Sparkles className="h-3 w-3" /> {translate(getSlideTransitionLabelKey(transitionKind))}
      </ValueBadge>
      <ValueBadge className="gap-1">
        <Wand2 className="h-3 w-3" /> {translate(getBackgroundTransitionLabelKey(backgroundKind))}
      </ValueBadge>
    </>
  );
}
