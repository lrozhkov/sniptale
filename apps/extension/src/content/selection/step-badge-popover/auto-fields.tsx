import {
  ProductGlassChip,
  ProductGlassRow,
  ProductGlassSectionLabel,
} from '@sniptale/ui/product-glass-controls';
import { translate } from '../../../platform/i18n';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import {
  type AutoStepBadgeType,
  buildStepBadgeAlphabetOptions,
  buildStepBadgeTypeOptions,
} from './helpers';

export function StepBadgeAutoFields(props: {
  settings: StepBadgeSettings;
  onAlphabetChange: (alphabet: 'cyrillic' | 'latin') => void;
  onTypeChange: (type: AutoStepBadgeType) => void;
}) {
  return (
    <>
      <div className="sniptale-step-badge-group">
        <ProductGlassSectionLabel>
          {translate('content.stepBadge.typeLabel')}
        </ProductGlassSectionLabel>
        <ProductGlassRow>
          {buildStepBadgeTypeOptions().map((option) => (
            <ProductGlassChip
              key={option.value}
              onClick={() => props.onTypeChange(option.value)}
              active={props.settings.type === option.value}
              className="sniptale-step-badge-chip"
            >
              {translate(option.key)}
            </ProductGlassChip>
          ))}
        </ProductGlassRow>
      </div>

      {props.settings.type === 'letter' ? (
        <div className="sniptale-step-badge-group">
          <ProductGlassSectionLabel>
            {translate('content.stepBadge.alphabetLabel')}
          </ProductGlassSectionLabel>
          <ProductGlassRow>
            {buildStepBadgeAlphabetOptions().map((option) => (
              <ProductGlassChip
                key={option.value}
                onClick={() => props.onAlphabetChange(option.value)}
                active={props.settings.alphabet === option.value}
                className="sniptale-step-badge-chip"
              >
                {translate(option.key)}
              </ProductGlassChip>
            ))}
          </ProductGlassRow>
        </div>
      ) : null}
    </>
  );
}
