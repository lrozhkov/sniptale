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
  Tag,
  Type,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
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
import { CalloutBackgroundSettings, CalloutSizeSettings } from './inspector-surface';
import {
  CalloutBadgeSettings,
  CalloutTextSettings,
  CalloutTitleSettings,
} from './inspector-typography';
import {
  CategorizedInspector,
  type CategorizedInspectorSection,
} from '@sniptale/ui/categorized-inspector';
import { HighlighterManualInspectorSurface } from '../manual-inspector-surface';

type ManualSection =
  | 'position'
  | 'save'
  | 'accent'
  | 'text'
  | 'title'
  | 'badge'
  | 'divider'
  | 'size'
  | 'background'
  | 'connector'
  | 'css'
  | 'border';

type ManualSectionOption = Omit<CategorizedInspectorSection<ManualSection>, 'label'> & {
  labelKey: TranslationKey;
};

const MANUAL_SECTIONS: ManualSectionOption[] = [
  { icon: Type, id: 'text', labelKey: 'content.callout.manualText' },
  { icon: Heading, id: 'title', labelKey: 'content.callout.manualTitle' },
  { icon: Maximize2, id: 'size', labelKey: 'content.callout.manualSize' },
  { icon: PaintBucket, id: 'background', labelKey: 'content.callout.manualBackground' },
  { icon: PanelTop, id: 'accent', labelKey: 'content.callout.manualAccent' },
  { icon: Cable, id: 'connector', labelKey: 'content.callout.manualConnector' },
  { icon: Square, id: 'border', labelKey: 'content.callout.manualBorder' },
  { icon: Braces, id: 'css', labelKey: 'content.callout.manualCss' },
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
    case 'badge':
      return <CalloutBadgeSettings {...props} />;
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
  const sections: ManualSectionOption[] = [
    MANUAL_SECTIONS[0]!,
    MANUAL_SECTIONS[1]!,
    ...(props.settings.style.title.enabled
      ? ([
          { icon: Tag, id: 'badge', labelKey: 'content.callout.manualBadge' },
          { icon: Minus, id: 'divider', labelKey: 'content.callout.manualDivider' },
        ] satisfies ManualSectionOption[])
      : []),
    ...MANUAL_SECTIONS.slice(2),
    ...(props.positionSection
      ? ([
          { icon: MapPin, id: 'position', labelKey: 'content.callout.positionSection' },
        ] satisfies ManualSectionOption[])
      : []),
    ...(props.saveSection
      ? ([
          { icon: Save, id: 'save', labelKey: 'content.callout.manualSave' },
        ] satisfies ManualSectionOption[])
      : []),
  ];
  const translatedSections = sections.map(({ icon, id, labelKey }) => ({
    icon,
    id,
    label: translate(labelKey),
  }));
  const renderSectionHeadingControl = (section: ManualSection) => {
    if (section === 'title') {
      const enabled = props.settings.style.title.enabled;
      return (
        <ProductGlassSwitch
          aria-label={translate('content.callout.titleToggle')}
          on={enabled}
          onClick={() => props.onChange({ style: { title: { enabled: !enabled } } })}
        />
      );
    }
    if (section === 'badge') {
      const enabled = props.settings.style.badge.enabled;
      return (
        <ProductGlassSwitch
          aria-label={translate('content.callout.badgeEnabled')}
          on={enabled}
          onClick={() => props.onChange({ style: { badge: { enabled: !enabled } } })}
        />
      );
    }
    if (section === 'accent') {
      const enabled = props.settings.style.accentEdge.enabled;
      return (
        <ProductGlassSwitch
          aria-label={translate('content.callout.accentEnabled')}
          on={enabled}
          onClick={() => props.onChange({ style: { accentEdge: { enabled: !enabled } } })}
        />
      );
    }
    return null;
  };
  return (
    <ContentPopoverSection
      dataUi="content.callout-settings.manual-section"
      className="!p-0 overflow-hidden"
    >
      <HighlighterManualInspectorSurface>
        <CategorizedInspector
          ariaLabel={translate('content.callout.manualNavigation')}
          initialSection="text"
          renderSectionHeadingControl={renderSectionHeadingControl}
          showSectionHeading
          sections={translatedSections}
          renderSection={(section) => <ManualSettingsContent {...props} section={section} />}
        />
      </HighlighterManualInspectorSurface>
    </ContentPopoverSection>
  );
}
