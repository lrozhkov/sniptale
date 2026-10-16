import { Droplet, Square, Waves } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';

import type { BlurType } from '../../../../../features/highlighter/contracts';
import { translate } from '../../../../../platform/i18n';
import { SettingsSwitch } from '../../../../section-surface/panel-controls';
import { SettingsRangeField, settingsToggleRowClassName } from '../../../../section-surface';
import { useRangeDraftValue } from './range-draft';
import type { HighlighterEffectsProps } from './types';

const blurTypeOptions = [
  {
    value: 'gaussian',
    label: translate('highlighter.section.blurTypeGaussian'),
    icon: <Droplet size={14} />,
  },
  {
    value: 'distortion',
    label: translate('highlighter.section.blurTypeDistortion'),
    icon: <Waves size={14} />,
  },
  {
    value: 'solid',
    label: translate('highlighter.section.blurTypeSolid'),
    icon: <Square size={14} />,
  },
] as const;

function BlurTypeOptionButton({
  icon,
  isActive,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  isActive: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <ProductActionButton
      compact
      tone="toggle"
      active={isActive}
      aria-pressed={isActive}
      onClick={onClick}
      title={label}
      className="min-w-0 flex-1"
    >
      {icon}
      <span className="min-w-0 truncate" title={label}>
        {label}
      </span>
    </ProductActionButton>
  );
}

function createBlurAmountCommitHandler(props: HighlighterEffectsProps) {
  return (value: number) =>
    props.effects.handleUpdateBlurSettings({
      ...props.settings.defaultBlurSettings,
      amount: value,
    });
}

function createBlurTypeChangeHandler(props: HighlighterEffectsProps) {
  return (blurType: BlurType) =>
    props.effects.handleUpdateBlurSettings({
      ...props.settings.defaultBlurSettings,
      blurType,
    });
}

function createShowBorderChangeHandler(props: HighlighterEffectsProps) {
  return (checked: boolean) =>
    props.effects.handleUpdateBlurSettings({
      ...props.settings.defaultBlurSettings,
      showBorder: checked,
    });
}

function BlurTypeOptionsList(props: {
  blurType: BlurType;
  onBlurTypeChange: (blurType: BlurType) => void;
}) {
  return (
    <div className="flex gap-1">
      {blurTypeOptions.map((option) => (
        <BlurTypeOptionButton
          key={option.value}
          icon={option.icon}
          isActive={props.blurType === option.value}
          label={option.label}
          onClick={() => props.onBlurTypeChange(option.value as BlurType)}
        />
      ))}
    </div>
  );
}

export function HighlighterBlurControls({ effects, settings }: HighlighterEffectsProps) {
  const props = { effects, settings };
  const [blurAmountDraft, setBlurAmountDraft] = useRangeDraftValue(
    settings.defaultBlurSettings.amount
  );
  const handleBlurAmountCommit = createBlurAmountCommitHandler(props);
  const handleBlurTypeChange = createBlurTypeChangeHandler(props);
  const handleShowBorderChange = createShowBorderChangeHandler(props);

  return (
    <div className="space-y-3">
      <SettingsRangeField
        min="1"
        max="25"
        value={blurAmountDraft}
        onChange={(event) => setBlurAmountDraft(parseInt(event.target.value))}
        onValueCommit={handleBlurAmountCommit}
        label={translate('highlighter.section.blurAmountLabel')}
        displayValue={blurAmountDraft}
      />

      <div>
        <label
          className={[
            'mb-1 block text-[13px] leading-[18px] font-medium',
            'text-[var(--sniptale-color-text-secondary)]',
          ].join(' ')}
        >
          {translate('highlighter.section.blurTypeLabel')}
        </label>
        <BlurTypeOptionsList
          blurType={settings.defaultBlurSettings.blurType}
          onBlurTypeChange={handleBlurTypeChange}
        />
      </div>

      <div className={settingsToggleRowClassName}>
        <span className="text-[13px] leading-[18px] font-medium text-[var(--sniptale-color-text-secondary)]">
          {translate('highlighter.section.showBorderLabel')}
        </span>
        <SettingsSwitch
          aria-label={translate('highlighter.section.showBorderLabel')}
          checked={settings.defaultBlurSettings.showBorder ?? false}
          onClick={() =>
            handleShowBorderChange(!(settings.defaultBlurSettings.showBorder ?? false))
          }
        />
      </div>
    </div>
  );
}
