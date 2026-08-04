import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import {
  Cable,
  Braces,
  Heading,
  MapPin,
  Maximize2,
  Minus,
  PaintBucket,
  PanelTop,
  Save,
  Square,
  Type,
} from 'lucide-react';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { translate, type TranslationKey } from '../../../platform/i18n';
import {
  CalloutBorderSettings,
  CalloutAccentSettings,
  CalloutConnectorSettings,
  CalloutDividerSettings,
} from './inspector-effects';
import type { ManualContentProps } from './inspector-fields';
import { CalloutCssSettings } from './inspector-css';
import { CalloutSaveSettings, type CalloutSaveSectionProps } from './inspector-save';
import {
  CalloutBackgroundSettings,
  CalloutSizeSettings,
  CalloutTextSettings,
  CalloutTitleSettings,
} from './inspector-surface';

type ManualSection =
  | 'position'
  | 'save'
  | 'accent'
  | 'text'
  | 'title'
  | 'divider'
  | 'size'
  | 'background'
  | 'connector'
  | 'css'
  | 'border';

type ManualSectionOption = {
  icon: ComponentType<{ size?: number }>;
  key: ManualSection;
  labelKey: TranslationKey;
};

const MANUAL_SECTIONS: ManualSectionOption[] = [
  { icon: Type, key: 'text', labelKey: 'content.callout.manualText' },
  { icon: Heading, key: 'title', labelKey: 'content.callout.manualTitle' },
  { icon: Maximize2, key: 'size', labelKey: 'content.callout.manualSize' },
  { icon: PaintBucket, key: 'background', labelKey: 'content.callout.manualBackground' },
  { icon: PanelTop, key: 'accent', labelKey: 'content.callout.manualAccent' },
  { icon: Cable, key: 'connector', labelKey: 'content.callout.manualConnector' },
  { icon: Square, key: 'border', labelKey: 'content.callout.manualBorder' },
  { icon: Braces, key: 'css', labelKey: 'content.callout.manualCss' },
];

function ManualSettingsContent(
  props: ManualContentProps & {
    positionSection?: ReactNode;
    saveSection?: CalloutSaveSectionProps;
    section: ManualSection;
  }
) {
  switch (props.section) {
    case 'position':
      return props.positionSection ?? null;
    case 'save':
      return props.saveSection ? <CalloutSaveSettings {...props.saveSection} /> : null;
    case 'text':
      return <CalloutTextSettings {...props} />;
    case 'title':
      return <CalloutTitleSettings {...props} />;
    case 'accent':
      return <CalloutAccentSettings {...props} />;
    case 'divider':
      return <CalloutDividerSettings {...props} />;
    case 'size':
      return <CalloutSizeSettings {...props} />;
    case 'background':
      return <CalloutBackgroundSettings {...props} />;
    case 'connector':
      return <CalloutConnectorSettings {...props} />;
    case 'css':
      return <CalloutCssSettings {...props} />;
    case 'border':
      return <CalloutBorderSettings {...props} />;
  }
}

export function CalloutManualSettings(
  props: ManualContentProps & {
    positionSection?: ReactNode;
    saveSection?: CalloutSaveSectionProps;
  }
) {
  const [section, setSection] = useState<ManualSection>('text');
  const sections: ManualSectionOption[] = [
    MANUAL_SECTIONS[0]!,
    MANUAL_SECTIONS[1]!,
    ...(props.settings.style.title.enabled
      ? ([
          { icon: Minus, key: 'divider', labelKey: 'content.callout.manualDivider' },
        ] satisfies ManualSectionOption[])
      : []),
    ...MANUAL_SECTIONS.slice(2),
    ...(props.positionSection
      ? ([
          { icon: MapPin, key: 'position', labelKey: 'content.callout.positionSection' },
        ] satisfies ManualSectionOption[])
      : []),
    ...(props.saveSection
      ? ([
          { icon: Save, key: 'save', labelKey: 'content.callout.manualSave' },
        ] satisfies ManualSectionOption[])
      : []),
  ];
  useEffect(() => {
    if (!props.settings.style.title.enabled && section === 'divider') setSection('text');
  }, [props.settings.style.title.enabled, section]);
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
