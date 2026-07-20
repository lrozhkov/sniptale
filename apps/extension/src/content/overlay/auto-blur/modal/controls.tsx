import { Droplet, Square, Waves } from 'lucide-react';
import type { BlurSettings, BlurType } from '../../../../features/highlighter/contracts';
import { translate } from '../../../../platform/i18n';
import { getControlSegmentedOptionClassName } from '@sniptale/ui/control-language';
import { ProductRange, ProductToggle } from '@sniptale/ui/product-form-controls';
import { buildBlurTypeOptions } from '../../../selection/frame-settings-popover/helpers';

function BlurTypeIcon(props: { iconName: 'droplet' | 'square' | 'waves' }) {
  if (props.iconName === 'droplet') return <Droplet className="h-4 w-4" />;
  if (props.iconName === 'waves') return <Waves className="h-4 w-4" />;
  return <Square className="h-4 w-4" />;
}

function AutoBlurTypePicker(props: {
  blurType: BlurType;
  updateBlurSettings: (patch: Partial<BlurSettings>) => void;
}) {
  return (
    <div
      role="group"
      aria-label={translate('content.overlayControls.blurTypeLabel')}
      className="grid grid-cols-3 gap-2"
    >
      {buildBlurTypeOptions().map((option) => (
        <AutoBlurTypeButton
          key={option.value}
          label={option.label}
          iconName={option.iconName}
          selected={props.blurType === option.value}
          onClick={() => props.updateBlurSettings({ blurType: option.value })}
        />
      ))}
    </div>
  );
}

function AutoBlurTypeButton(props: {
  iconName: 'droplet' | 'square' | 'waves';
  label: string;
  onClick: () => void;
  selected: boolean;
}) {
  return (
    <button
      type="button"
      className={[
        'flex w-full flex-col items-center justify-center gap-2 text-center transition-colors',
        getControlSegmentedOptionClassName({
          active: props.selected,
          density: 'default',
          layout: 'tile',
        }),
      ].join(' ')}
      onClick={props.onClick}
      aria-pressed={props.selected}
    >
      <span className="flex items-center justify-center">
        <BlurTypeIcon iconName={props.iconName} />
      </span>
      <span className="text-sm font-medium leading-5">{props.label}</span>
    </button>
  );
}

export function AutoBlurBlurControls(props: {
  blurSettings: BlurSettings;
  setBlurSettings: (settings: BlurSettings) => void;
}) {
  const updateBlurSettings = (patch: Partial<BlurSettings>) =>
    props.setBlurSettings({ ...props.blurSettings, ...patch });

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="sniptale-label-sm">{translate('content.autoBlur.blurStrength')}</div>
        <div className="text-sm font-medium text-[var(--sniptale-color-text)]">
          {props.blurSettings.amount}
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_max-content] items-center gap-5">
        <ProductRange
          min={1}
          max={25}
          value={props.blurSettings.amount}
          onChange={(event) => updateBlurSettings({ amount: Number(event.target.value) })}
        />
        <label className="flex min-w-[150px] items-center justify-end gap-2 text-sm">
          <span>{translate('content.autoBlur.showBorder')}</span>
          <ProductToggle
            size="sm"
            checked={props.blurSettings.showBorder ?? false}
            onClick={() =>
              updateBlurSettings({ showBorder: !(props.blurSettings.showBorder ?? false) })
            }
          />
        </label>
      </div>
      <AutoBlurTypePicker
        blurType={props.blurSettings.blurType as BlurType}
        updateBlurSettings={updateBlurSettings}
      />
    </section>
  );
}
