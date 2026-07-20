import { translate } from '../../../../platform/i18n';
import { EditorInspectorPresetHeader } from '../../presets';
import { CollapsibleSection } from '../sections';
import {
  ShadowAngleSection,
  ShadowBlurSection,
  ShadowDistanceSection,
  ShadowRangeSection,
} from '../shadow';
import {
  renderTextBackgroundColorSection,
  renderTextBackgroundOpacityPanel,
  renderTextForegroundColorSection,
  renderTextOpacityPanel,
  renderTextShadowColorSection,
} from './colors';
import { renderTextAlignSection, renderTextVerticalAlignSection } from './layout';
import { renderTextFontSection } from './selectors';
import { renderTextSizeControl } from './size';
import { renderTextTypographyGrid } from './typography';
import type { TextControlsProps } from './types';

function renderTextShadowAnglePanel(props: TextControlsProps) {
  const settings = props.inspectorToolSettings.text;

  return (
    <ShadowAngleSection
      value={settings.shadowAngle ?? 90}
      onChange={(shadowAngle) => props.previewTextPatch({ shadowAngle })}
      onValueCommit={props.commitPendingSelectionSettings}
    />
  );
}

function renderTextShadowDistancePanel(props: TextControlsProps) {
  const settings = props.inspectorToolSettings.text;

  return (
    <ShadowDistanceSection
      value={settings.shadowDistance ?? 4}
      onChange={(shadowDistance) => props.previewTextPatch({ shadowDistance })}
      onValueCommit={props.commitPendingSelectionSettings}
    />
  );
}

function renderTextShadowBlurPanel(props: TextControlsProps) {
  const settings = props.inspectorToolSettings.text;

  return (
    <ShadowBlurSection
      value={settings.shadowBlur ?? 12}
      onChange={(shadowBlur) => props.previewTextPatch({ shadowBlur })}
      onValueCommit={props.commitPendingSelectionSettings}
    />
  );
}

function renderTextCoreSection(props: TextControlsProps) {
  const settings = props.inspectorToolSettings.text;

  return (
    <CollapsibleSection key="text" label={translate('editor.compact.textShort')}>
      <div className="space-y-3">
        {renderTextFontSection(props, settings)}
        {renderTextSizeControl(props, settings.fontSize)}
        {renderTextAlignSection(props, settings)}
        {renderTextVerticalAlignSection(props, settings)}
        {renderTextTypographyGrid(props, settings)}
        {renderTextForegroundColorSection(props, settings)}
        {renderTextOpacityPanel(props, settings)}
      </div>
    </CollapsibleSection>
  );
}

function renderTextBackgroundSection(props: TextControlsProps) {
  const settings = props.inspectorToolSettings.text;

  return (
    <CollapsibleSection key="background" label={translate('editor.compact.backgroundShort')}>
      <div className="space-y-3">
        {renderTextBackgroundColorSection(props, settings)}
        {renderTextBackgroundOpacityPanel(props, settings)}
      </div>
    </CollapsibleSection>
  );
}

function renderTextShadowSection(props: TextControlsProps) {
  const settings = props.inspectorToolSettings.text;

  return (
    <CollapsibleSection key="shadow" label={translate('highlighter.editor.shadowLabel')}>
      <div className="space-y-3">
        <ShadowRangeSection
          key="shadow"
          label={translate('editor.compact.shadowSize')}
          value={settings.shadow}
          onChange={(shadow) => {
            props.previewTextPatch({ shadow });
          }}
          onValueCommit={props.commitPendingSelectionSettings}
        />
        {renderTextShadowColorSection(props, settings)}
        {renderTextShadowAnglePanel(props)}
        {renderTextShadowDistancePanel(props)}
        {renderTextShadowBlurPanel(props)}
      </div>
    </CollapsibleSection>
  );
}

export function renderTextControlsSection(props: TextControlsProps) {
  const controls = [
    renderTextCoreSection(props),
    renderTextBackgroundSection(props),
    renderTextShadowSection(props),
  ];

  return (
    <div className="space-y-3">
      {props.toolPresetHeader ? (
        <EditorInspectorPresetHeader state={props.toolPresetHeader}>
          {controls}
        </EditorInspectorPresetHeader>
      ) : (
        controls
      )}
    </div>
  );
}
