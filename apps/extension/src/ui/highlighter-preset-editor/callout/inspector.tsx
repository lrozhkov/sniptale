import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import { Cable, MapPin, Maximize2, PaintBucket, Square, Type } from 'lucide-react';
import { useState, type ComponentType, type ReactNode } from 'react';
import { translate, type TranslationKey } from '../../../platform/i18n';
import { CalloutBorderSettings, CalloutConnectorSettings } from './inspector-effects';
import type { ManualContentProps } from './inspector-fields';
import {
  CalloutBackgroundSettings,
  CalloutSizeSettings,
  CalloutTextSettings,
} from './inspector-surface';

type ManualSection = 'position' | 'text' | 'size' | 'background' | 'connector' | 'border';

type ManualSectionOption = {
  icon: ComponentType<{ size?: number }>;
  key: ManualSection;
  labelKey: TranslationKey;
};

const MANUAL_SECTIONS: ManualSectionOption[] = [
  { icon: Type, key: 'text', labelKey: 'content.callout.manualText' },
  { icon: Maximize2, key: 'size', labelKey: 'content.callout.manualSize' },
  { icon: PaintBucket, key: 'background', labelKey: 'content.callout.manualBackground' },
  { icon: Cable, key: 'connector', labelKey: 'content.callout.manualConnector' },
  { icon: Square, key: 'border', labelKey: 'content.callout.manualBorder' },
];

function ManualSettingsContent(
  props: ManualContentProps & { positionSection?: ReactNode; section: ManualSection }
) {
  switch (props.section) {
    case 'position':
      return props.positionSection ?? null;
    case 'text':
      return <CalloutTextSettings {...props} />;
    case 'size':
      return <CalloutSizeSettings {...props} />;
    case 'background':
      return <CalloutBackgroundSettings {...props} />;
    case 'connector':
      return <CalloutConnectorSettings {...props} />;
    case 'border':
      return <CalloutBorderSettings {...props} />;
  }
}

export function CalloutManualSettings(props: ManualContentProps & { positionSection?: ReactNode }) {
  const sections = props.positionSection
    ? ([
        ...MANUAL_SECTIONS,
        { icon: MapPin, key: 'position', labelKey: 'content.callout.positionSection' },
      ] satisfies ManualSectionOption[])
    : MANUAL_SECTIONS;
  const [section, setSection] = useState<ManualSection>('text');
  return (
    <ContentPopoverSection
      dataUi="content.callout-settings.manual-section"
      className="!p-0 overflow-hidden"
    >
      <div className="grid min-h-48 grid-cols-[3rem_minmax(0,1fr)]">
        <nav
          className="grid content-start gap-1 border-r border-[color:var(--sniptale-color-border-soft)] p-1.5"
          aria-label={translate('content.callout.manualNavigation')}
        >
          {sections.map((option) => {
            const Icon = option.icon;
            const label = translate(option.labelKey);
            return (
              <button
                key={option.key}
                type="button"
                className={[
                  'inline-flex h-9 w-9 items-center justify-center rounded-[7px]',
                  section === option.key
                    ? 'bg-[var(--sniptale-color-accent-soft)] text-[var(--sniptale-color-accent)]'
                    : 'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-input)]',
                ].join(' ')}
                aria-label={label}
                aria-pressed={section === option.key}
                title={label}
                onClick={() => setSection(option.key)}
              >
                <Icon size={17} />
              </button>
            );
          })}
        </nav>
        <div className="min-w-0 p-2.5">
          <ManualSettingsContent {...props} section={section} />
        </div>
      </div>
    </ContentPopoverSection>
  );
}
