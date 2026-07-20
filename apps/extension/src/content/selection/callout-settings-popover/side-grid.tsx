import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import {
  ProductGlassArrowGrid,
  ProductGlassDimMarker,
  ProductGlassIconButton,
} from '@sniptale/ui/product-glass-controls';
import { translate } from '../../../platform/i18n';
import type { CalloutSide } from '@sniptale/runtime-contracts/highlighter/callout';

export function CalloutSettingsSideGrid(props: {
  onSideChange: (side: CalloutSide) => void;
  side: CalloutSide;
}) {
  return (
    <ProductGlassArrowGrid>
      <span />
      <ProductGlassIconButton
        onClick={() => props.onSideChange('top')}
        title={translate('content.callout.sideTop')}
        active={props.side === 'top'}
      >
        <ArrowUp size={14} />
      </ProductGlassIconButton>
      <span />
      <ProductGlassIconButton
        onClick={() => props.onSideChange('left')}
        title={translate('content.callout.sideLeft')}
        active={props.side === 'left'}
      >
        <ArrowLeft size={14} />
      </ProductGlassIconButton>
      <ProductGlassIconButton
        onClick={() => props.onSideChange('auto')}
        title={translate('content.callout.sideAuto')}
        active={props.side === 'auto'}
      >
        <ProductGlassDimMarker style={{ fontSize: 10, fontWeight: 700 }}>A</ProductGlassDimMarker>
      </ProductGlassIconButton>
      <ProductGlassIconButton
        onClick={() => props.onSideChange('right')}
        title={translate('content.callout.sideRight')}
        active={props.side === 'right'}
      >
        <ArrowRight size={14} />
      </ProductGlassIconButton>
      <span />
      <ProductGlassIconButton
        onClick={() => props.onSideChange('bottom')}
        title={translate('content.callout.sideBottom')}
        active={props.side === 'bottom'}
      >
        <ArrowDown size={14} />
      </ProductGlassIconButton>
      <span />
    </ProductGlassArrowGrid>
  );
}
