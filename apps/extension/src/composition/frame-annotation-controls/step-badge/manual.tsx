import type {
  StepBadgeAnchor,
  StepBadgePreset,
  StepBadgeSettings,
  StepBadgeTemplateSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import { CategorizedInspector } from '@sniptale/ui/categorized-inspector';
import { Braces, Hash, MapPin, Maximize2, Palette, Save } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import {
  StepBadgeColorSection,
  StepBadgeSizeSection,
} from '../../../ui/highlighter-preset-editor/step-badge/inspector';
import { StepBadgeCssSection } from '../../../ui/highlighter-preset-editor/step-badge/inspector-css';
import { HighlighterManualInspectorSurface } from '../../../ui/highlighter-preset-editor/manual-inspector-surface';
import { StepBadgeSaveSection } from './save-section';
import { StepBadgeAutoSection, StepBadgePositionSection, StepBadgeValueSection } from './views';

type ManualSection = 'numbering' | 'position' | 'size' | 'colors' | 'css' | 'save';

type StepBadgeManualSettingsProps = {
  frameId: string;
  frameVisuals: {
    borderColor: string;
    borderWidth: number;
    fillColor?: string;
    fillOpacity?: number;
  };
  isAuto: boolean;
  onAlphabetChange: (alphabet: 'cyrillic' | 'latin') => void;
  onAnchorChange: (anchor: StepBadgeAnchor) => void;
  onAutoModeChange: (auto: boolean) => void;
  onCreatePreset: (
    name: string,
    settings: StepBadgeTemplateSettings
  ) => Promise<{ outcome: string }>;
  onOffsetToggle: (direction: 'up' | 'down' | 'left' | 'right') => void;
  onFloatingInteractionChange?: (open: boolean) => void;
  onSettingsChange: (patch: Partial<StepBadgeSettings>) => void;
  onTypeChange: (type: 'number' | 'letter') => void;
  onUpdatePreset: (
    preset: StepBadgePreset,
    settings: StepBadgeTemplateSettings
  ) => Promise<{ outcome: string }>;
  onValueChange: (value: string) => void;
  presets: StepBadgePreset[];
  settings: StepBadgeSettings;
  templateSettings: StepBadgeTemplateSettings;
  onReorder?: (direction: 'up' | 'down', frameId: string) => void;
};

export function StepBadgeManualSettings(props: StepBadgeManualSettingsProps) {
  const selectedAnchor = props.settings.anchor ?? 'top-left';
  const selectedOffsets = props.settings.offsetDirections ?? [];
  const sections = [
    { icon: Hash, id: 'numbering', label: translate('content.stepBadge.numberingSection') },
    { icon: MapPin, id: 'position', label: translate('content.stepBadge.positionSection') },
    { icon: Maximize2, id: 'size', label: translate('content.stepBadge.sizeSection') },
    { icon: Palette, id: 'colors', label: translate('content.stepBadge.colorsSection') },
    { icon: Braces, id: 'css', label: translate('content.stepBadge.cssSection') },
    { icon: Save, id: 'save', label: translate('content.stepBadge.saveSection') },
  ] as const;
  const renderSection = (section: ManualSection) => {
    if (section === 'numbering') {
      return (
        <div className="grid gap-3">
          <StepBadgeAutoSection {...props} embedded settings={props.settings} />
          {!props.isAuto ? (
            <StepBadgeValueSection
              embedded
              frameId={props.frameId}
              isAuto={false}
              onValueChange={props.onValueChange}
              value={props.settings.value}
              {...(props.onReorder ? { onReorder: props.onReorder } : {})}
            />
          ) : null}
        </div>
      );
    }
    if (section === 'position') {
      return (
        <StepBadgePositionSection
          embedded
          onAnchorChange={props.onAnchorChange}
          onOffsetToggle={props.onOffsetToggle}
          selectedAnchor={selectedAnchor}
          selectedOffsets={selectedOffsets}
        />
      );
    }
    if (section === 'size') {
      return (
        <StepBadgeSizeSection
          embedded
          frame={props.frameVisuals}
          onChange={props.onSettingsChange}
          settings={props.settings}
        />
      );
    }
    if (section === 'colors') {
      return (
        <StepBadgeColorSection
          embedded
          frame={props.frameVisuals}
          onChange={props.onSettingsChange}
          settings={props.settings}
        />
      );
    }
    if (section === 'css') {
      return <StepBadgeCssSection onChange={props.onSettingsChange} settings={props.settings} />;
    }
    return (
      <StepBadgeSaveSection
        embedded
        onCreate={props.onCreatePreset}
        {...(props.onFloatingInteractionChange
          ? { onFloatingInteractionChange: props.onFloatingInteractionChange }
          : {})}
        onUpdate={props.onUpdatePreset}
        presets={props.presets}
        settings={props.templateSettings}
      />
    );
  };

  return (
    <ContentPopoverSection
      className="!p-0 overflow-hidden"
      dataUi="content.step-badge.manual-section"
    >
      <HighlighterManualInspectorSurface>
        <CategorizedInspector
          ariaLabel={translate('content.stepBadge.manualNavigation')}
          initialSection="numbering"
          renderSection={renderSection}
          sections={sections}
          showSectionHeading
        />
      </HighlighterManualInspectorSurface>
    </ContentPopoverSection>
  );
}
