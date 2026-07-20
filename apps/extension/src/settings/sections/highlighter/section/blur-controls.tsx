import { Droplet, Square, Waves } from 'lucide-react';

import type { BlurType } from '../../../../features/highlighter/contracts';
import { translate } from '../../../../platform/i18n';
import { SettingsSwitch } from '../../../section-surface/panel-controls';
import { SettingsRangeField, settingsToggleRowClassName } from '../../../section-surface';
import { useRangeDraftValue } from './range-draft';
import type { HighlighterSectionContentProps } from './types';
import {
  ACTIVE_BLUR_BACKGROUND_CLASS_NAME,
  ACTIVE_BLUR_BORDER_CLASS_NAME,
} from './blur-controls.constants';

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
    <button
      onClick={onClick}
      title={label}
      className={[
        'flex flex-1 flex-col items-center gap-1 rounded-[12px] px-3 py-2 text-xs transition-all',
        isActive
          ? ACTIVE_BLUR_BORDER_CLASS_NAME
          : 'border border-[var(--sniptale-color-border-soft)]',
        isActive
          ? [
              ACTIVE_BLUR_BACKGROUND_CLASS_NAME,
              'text-[var(--sniptale-color-accent)]',
              'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_6%,transparent)]',
            ].join(' ')
          : [
              'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-muted)_82%,transparent)]',
              'text-[var(--sniptale-color-text-muted)]',
              'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-border-subtle)_72%,transparent)]',
            ].join(' '),
      ].join(' ')}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function createBlurAmountCommitHandler(props: HighlighterSectionContentProps) {
  return (value: number) =>
    props.state.handleUpdateBlurSettings({
      ...props.settings.defaultBlurSettings,
      amount: value,
    });
}

function createBlurTypeChangeHandler(props: HighlighterSectionContentProps) {
  return (blurType: BlurType) =>
    props.state.handleUpdateBlurSettings({
      ...props.settings.defaultBlurSettings,
      blurType,
    });
}

function createShowBorderChangeHandler(props: HighlighterSectionContentProps) {
  return (checked: boolean) =>
    props.state.handleUpdateBlurSettings({
      ...props.settings.defaultBlurSettings,
      showBorder: checked,
    });
}

function BlurTypeOptionsList(props: {
  blurType: BlurType;
  onBlurTypeChange: (blurType: BlurType) => void;
}) {
  return (
    <div className="flex gap-2">
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

export function HighlighterBlurControls({ settings, state }: HighlighterSectionContentProps) {
  const props = { settings, state };
  const [blurAmountDraft, setBlurAmountDraft] = useRangeDraftValue(
    settings.defaultBlurSettings.amount
  );
  const handleBlurAmountCommit = createBlurAmountCommitHandler(props);
  const handleBlurTypeChange = createBlurTypeChangeHandler(props);
  const handleShowBorderChange = createShowBorderChangeHandler(props);

  return (
    <div className="space-y-4">
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
        <label className="mb-2 block text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('highlighter.section.blurTypeLabel')}
        </label>
        <BlurTypeOptionsList
          blurType={settings.defaultBlurSettings.blurType}
          onBlurTypeChange={handleBlurTypeChange}
        />
      </div>

      <div className={settingsToggleRowClassName}>
        <span className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('highlighter.section.showBorderLabel')}
        </span>
        <SettingsSwitch
          checked={settings.defaultBlurSettings.showBorder ?? false}
          onClick={() =>
            handleShowBorderChange(!(settings.defaultBlurSettings.showBorder ?? false))
          }
        />
      </div>
    </div>
  );
}
