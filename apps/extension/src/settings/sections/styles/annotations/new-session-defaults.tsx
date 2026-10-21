import type { AnnotationSessionDefaults } from '@sniptale/runtime-contracts/highlighter/border-preset';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { SettingsControlRow } from '../../../section-surface';
import { SettingsSwitch } from '../../../section-surface/panel-controls';

export function AnnotationNewSessionDefaults(props: {
  copy: {
    enabledDescription: string;
    enabledLabel: string;
    frameTemplate: string;
    primaryTemplate: string;
    sourceDescription: string;
    sourceLabel: string;
    sectionDescription: string;
    sectionTitle: string;
  };
  defaults: AnnotationSessionDefaults;
  disabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onTemplateSourceChange: (source: AnnotationSessionDefaults['templateSource']) => void;
}) {
  return (
    <section className="mb-3 space-y-1 border-b border-[var(--sniptale-color-border-subtle)] pb-3">
      <div className="mb-1">
        <h2 className="text-[14px] leading-5 font-semibold">{props.copy.sectionTitle}</h2>
      </div>
      <SettingsControlRow label={props.copy.enabledLabel} valueClassName="flex justify-end">
        <SettingsSwitch
          aria-label={props.copy.enabledLabel}
          checked={props.defaults.enabled}
          disabled={props.disabled}
          onClick={() => props.onEnabledChange(!props.defaults.enabled)}
        />
      </SettingsControlRow>
      <SettingsControlRow label={props.copy.sourceLabel}>
        <ProductSelect<AnnotationSessionDefaults['templateSource']>
          aria-label={props.copy.sourceLabel}
          disabled={props.disabled}
          onChange={props.onTemplateSourceChange}
          options={[
            { label: props.copy.frameTemplate, value: 'frame-default' },
            { label: props.copy.primaryTemplate, value: 'forced' },
          ]}
          value={props.defaults.templateSource}
        />
      </SettingsControlRow>
    </section>
  );
}
