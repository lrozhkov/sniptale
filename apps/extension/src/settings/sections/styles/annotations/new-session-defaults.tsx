import type { AnnotationSessionDefaults } from '@sniptale/runtime-contracts/highlighter/border-preset';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { SettingsControlRow, settingsMetaLabelClassName } from '../../../section-surface';
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
    <section className="mb-6 space-y-1 border-b border-[var(--sniptale-color-border-subtle)] pb-6">
      <div className="mb-1">
        <h2 className={settingsMetaLabelClassName}>{props.copy.sectionTitle}</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
          {props.copy.sectionDescription}
        </p>
      </div>
      <SettingsControlRow
        label={props.copy.enabledLabel}
        description={props.copy.enabledDescription}
        valueClassName="flex justify-end"
      >
        <SettingsSwitch
          aria-label={props.copy.enabledLabel}
          checked={props.defaults.enabled}
          disabled={props.disabled}
          onClick={() => props.onEnabledChange(!props.defaults.enabled)}
        />
      </SettingsControlRow>
      <SettingsControlRow label={props.copy.sourceLabel} description={props.copy.sourceDescription}>
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
