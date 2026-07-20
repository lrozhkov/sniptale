import { translate } from '../../../../../platform/i18n';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import {
  getCursorAnimationOptions,
  getCursorCaptureModeOptions,
  getCursorPresetOptions,
} from './cursor-options';
import { NumberInput } from '../inputs/number';
import { ColorField, SelectInput, ToggleField } from '../shared/controls';
import { OptionButtonsField } from '../shared/option-buttons';
import { SliderField } from '../shared/sliders';

type CursorTrackCaptureMode = NonNullable<
  NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>['captureMode']
>;

export function CursorPositionFields(props: { x: number; y: number }) {
  return (
    <div className="space-y-3">
      <NumberInput label="X" value={props.x} disabled onChange={() => undefined} />
      <NumberInput label="Y" value={props.y} disabled onChange={() => undefined} />
    </div>
  );
}

export function CursorVisibilityField(props: {
  onChange: (visible: boolean) => void;
  visible: boolean;
}) {
  return (
    <div className="mt-3">
      <CursorSkinToggle
        checked={props.visible}
        label={translate('videoEditor.sidebar.cursorVisibleLabel')}
        onChange={props.onChange}
      />
    </div>
  );
}

export function CursorSkinFields(props: {
  animationPreset: NonNullable<
    NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>['skin']
  >['animationPreset'];
  captureMode: CursorTrackCaptureMode;
  color: string;
  hidden: boolean;
  preset: NonNullable<
    NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>['skin']
  >['preset'];
  recentColors: WorkspaceSidebarSelectionPanelProps['recentColors'];
  scale: number;
  shadow: boolean;
  onRememberRecentColor: WorkspaceSidebarSelectionPanelProps['onRememberRecentColor'];
  onSetCursorCaptureMode: WorkspaceSidebarSelectionPanelProps['onSetCursorCaptureMode'];
  onUpdateCursorSkin: WorkspaceSidebarSelectionPanelProps['onUpdateCursorSkin'];
}) {
  return (
    <div className="grid grid-cols-1 gap-3">
      <CursorCaptureModeField
        captureMode={props.captureMode}
        onSetCursorCaptureMode={props.onSetCursorCaptureMode}
      />
      <CursorAppearanceFields
        animationPreset={props.animationPreset}
        color={props.color}
        preset={props.preset}
        recentColors={props.recentColors}
        scale={props.scale}
        onRememberRecentColor={props.onRememberRecentColor}
        onUpdateCursorSkin={props.onUpdateCursorSkin}
      />
      <CursorSkinToggles
        hidden={props.hidden}
        shadow={props.shadow}
        onUpdateCursorSkin={props.onUpdateCursorSkin}
      />
    </div>
  );
}

function CursorCaptureModeField(props: {
  captureMode: CursorTrackCaptureMode;
  onSetCursorCaptureMode: WorkspaceSidebarSelectionPanelProps['onSetCursorCaptureMode'];
}) {
  return (
    <OptionButtonsField
      label={translate('videoEditor.sidebar.cursorCaptureModeLabel')}
      value={props.captureMode}
      onChange={props.onSetCursorCaptureMode}
      options={getCursorCaptureModeOptions()}
    />
  );
}

function CursorAppearanceFields(props: {
  animationPreset: NonNullable<
    NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>['skin']
  >['animationPreset'];
  color: string;
  preset: NonNullable<
    NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>['skin']
  >['preset'];
  recentColors: WorkspaceSidebarSelectionPanelProps['recentColors'];
  scale: number;
  onRememberRecentColor: WorkspaceSidebarSelectionPanelProps['onRememberRecentColor'];
  onUpdateCursorSkin: WorkspaceSidebarSelectionPanelProps['onUpdateCursorSkin'];
}) {
  return (
    <div className="space-y-3">
      <CursorPresetField preset={props.preset} onUpdateCursorSkin={props.onUpdateCursorSkin} />
      <CursorAnimationField
        animationPreset={props.animationPreset}
        onUpdateCursorSkin={props.onUpdateCursorSkin}
      />
      <ColorField
        label={translate('videoEditor.sidebar.cursorColorLabel')}
        recentColors={props.recentColors}
        onRememberRecentColor={props.onRememberRecentColor}
        value={props.color}
        onChange={(value) => props.onUpdateCursorSkin({ color: value })}
      />
      <SliderField
        label={translate('videoEditor.sidebar.cursorScaleLabel')}
        value={props.scale}
        min={0.2}
        max={4}
        step={0.1}
        onChange={(value) => props.onUpdateCursorSkin({ scale: value })}
        formatValue={(value) => `${Math.round(value * 100)}%`}
      />
    </div>
  );
}

function CursorPresetField(props: {
  preset: NonNullable<
    NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>['skin']
  >['preset'];
  onUpdateCursorSkin: WorkspaceSidebarSelectionPanelProps['onUpdateCursorSkin'];
}) {
  return (
    <SelectInput
      label={translate('videoEditor.sidebar.cursorPresetLabel')}
      value={props.preset}
      onChange={(value) =>
        props.onUpdateCursorSkin({
          preset: value as typeof props.preset,
        })
      }
      options={getCursorPresetOptions()}
    />
  );
}

function CursorAnimationField(props: {
  animationPreset: NonNullable<
    NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>['skin']
  >['animationPreset'];
  onUpdateCursorSkin: WorkspaceSidebarSelectionPanelProps['onUpdateCursorSkin'];
}) {
  return (
    <SelectInput
      label={translate('videoEditor.sidebar.cursorAnimationLabel')}
      value={props.animationPreset}
      onChange={(value) =>
        props.onUpdateCursorSkin({
          animationPreset: value as typeof props.animationPreset,
        })
      }
      options={getCursorAnimationOptions()}
    />
  );
}

function CursorSkinToggles(props: {
  hidden: boolean;
  shadow: boolean;
  onUpdateCursorSkin: WorkspaceSidebarSelectionPanelProps['onUpdateCursorSkin'];
}) {
  return (
    <>
      <CursorSkinToggle
        checked={props.shadow}
        label={translate('videoEditor.sidebar.cursorShadowLabel')}
        onChange={(checked) => props.onUpdateCursorSkin({ shadow: checked })}
      />
      <CursorSkinToggle
        checked={!props.hidden}
        label={translate('videoEditor.sidebar.cursorVisibleLabel')}
        onChange={(checked) => props.onUpdateCursorSkin({ hidden: !checked })}
      />
    </>
  );
}

function CursorSkinToggle(props: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const disabledProps = props.disabled === undefined ? {} : { disabled: props.disabled };

  return (
    <ToggleField
      checked={props.checked}
      label={props.label}
      onChange={props.onChange}
      {...disabledProps}
    />
  );
}
