import { Bold } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import {
  ProductGlassBoldButton,
  ProductGlassChip,
  ProductGlassRow,
} from '@sniptale/ui/product-glass-controls';
import type {
  CalloutFontFamily,
  CalloutSettings,
} from '@sniptale/runtime-contracts/highlighter/callout';

export function CalloutFontFamilyRow(props: {
  fontFamily: CalloutFontFamily;
  fontWeight: CalloutSettings['fontWeight'];
  onFontFamilyChange: (value: CalloutFontFamily) => void;
  onFontWeightToggle: () => void;
}) {
  return (
    <ProductGlassRow>
      {[
        { value: 'sans' as CalloutFontFamily, label: translate('content.callout.fontSans') },
        { value: 'serif' as CalloutFontFamily, label: translate('content.callout.fontSerif') },
        { value: 'mono' as CalloutFontFamily, label: translate('content.callout.fontMono') },
      ].map(({ value, label }) => (
        <ProductGlassChip
          key={value}
          onClick={() => props.onFontFamilyChange(value)}
          active={props.fontFamily === value}
          style={{ flex: 1 }}
        >
          {label}
        </ProductGlassChip>
      ))}
      <ProductGlassBoldButton
        onClick={props.onFontWeightToggle}
        active={props.fontWeight === 'bold'}
        title={translate('content.callout.boldTitle')}
      >
        <Bold size={14} />
      </ProductGlassBoldButton>
    </ProductGlassRow>
  );
}
