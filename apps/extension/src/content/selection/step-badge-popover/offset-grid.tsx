import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import {
  ProductGlassArrowGrid,
  ProductGlassDimMarker,
  ProductGlassIconButton,
} from '@sniptale/ui/product-glass-controls';
import { translate } from '../../../platform/i18n';

export function StepBadgePopoverOffsetGrid(props: {
  onOffsetToggle: (direction: 'up' | 'down' | 'left' | 'right') => void;
  selectedOffsets: string[];
}) {
  return (
    <ProductGlassArrowGrid>
      <span />
      <ProductGlassIconButton
        onClick={() => props.onOffsetToggle('up')}
        title={translate('content.stepBadge.offsetUp')}
        active={props.selectedOffsets.includes('up')}
      >
        <ArrowUp size={14} />
      </ProductGlassIconButton>
      <span />
      <ProductGlassIconButton
        onClick={() => props.onOffsetToggle('left')}
        title={translate('content.stepBadge.offsetLeft')}
        active={props.selectedOffsets.includes('left')}
      >
        <ArrowLeft size={14} />
      </ProductGlassIconButton>
      <ProductGlassDimMarker className="sniptale-step-badge-dim-marker">±</ProductGlassDimMarker>
      <ProductGlassIconButton
        onClick={() => props.onOffsetToggle('right')}
        title={translate('content.stepBadge.offsetRight')}
        active={props.selectedOffsets.includes('right')}
      >
        <ArrowRight size={14} />
      </ProductGlassIconButton>
      <span />
      <ProductGlassIconButton
        onClick={() => props.onOffsetToggle('down')}
        title={translate('content.stepBadge.offsetDown')}
        active={props.selectedOffsets.includes('down')}
      >
        <ArrowDown size={14} />
      </ProductGlassIconButton>
      <span />
    </ProductGlassArrowGrid>
  );
}
