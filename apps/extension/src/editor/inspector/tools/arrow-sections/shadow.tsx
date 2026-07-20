import { translate } from '../../../../platform/i18n';
import { ToolColorSection } from '../color-section';
import { CollapsibleSection } from '../sections';
import {
  ShadowAngleSection,
  ShadowBlurSection,
  ShadowDistanceSection,
  ShadowRangeSection,
} from '../shadow';
import type { ArrowControlsProps, ArrowSettings } from './types';

function renderArrowShadowColorSection(props: ArrowControlsProps, settings: ArrowSettings) {
  return (
    <ToolColorSection
      titleKey="editor.compact.color"
      value={settings.shadowColor ?? settings.color}
      recentColors={props.recentColors}
      palette={props.shapeStrokePalette}
      applyPatch={props.applyArrowPatch}
      createPatch={(shadowColor: string) => ({ shadowColor })}
      previewColor={props.previewColor}
      updateColor={props.updateColor}
    />
  );
}

function renderArrowShadowDirectionSection(props: ArrowControlsProps, settings: ArrowSettings) {
  return (
    <ShadowAngleSection
      value={settings.shadowAngle ?? 90}
      onChange={(shadowAngle) => props.previewArrowPatch({ shadowAngle })}
      onValueCommit={props.commitPendingSelectionSettings}
    />
  );
}

function renderArrowShadowDistanceSection(props: ArrowControlsProps, settings: ArrowSettings) {
  return (
    <ShadowDistanceSection
      value={settings.shadowDistance ?? 4}
      onChange={(shadowDistance) => props.previewArrowPatch({ shadowDistance })}
      onValueCommit={props.commitPendingSelectionSettings}
    />
  );
}

function renderArrowShadowBlurSection(props: ArrowControlsProps, settings: ArrowSettings) {
  return (
    <ShadowBlurSection
      value={settings.shadowBlur ?? 12}
      onChange={(shadowBlur) => props.previewArrowPatch({ shadowBlur })}
      onValueCommit={props.commitPendingSelectionSettings}
    />
  );
}

export function renderArrowShadowSection(props: ArrowControlsProps, settings: ArrowSettings) {
  return (
    <CollapsibleSection
      key="shadow"
      label={translate('highlighter.editor.shadowLabel')}
      defaultOpen={false}
    >
      <div className="space-y-3">
        <ShadowRangeSection
          label={translate('editor.compact.shadowSize')}
          value={settings.shadow}
          onChange={(shadow) => props.previewArrowPatch({ shadow })}
          onValueCommit={props.commitPendingSelectionSettings}
        />
        {renderArrowShadowColorSection(props, settings)}
        {renderArrowShadowDirectionSection(props, settings)}
        {renderArrowShadowDistanceSection(props, settings)}
        {renderArrowShadowBlurSection(props, settings)}
      </div>
    </CollapsibleSection>
  );
}
