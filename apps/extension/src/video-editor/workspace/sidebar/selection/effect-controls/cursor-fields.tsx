import { translate } from '../../../../../platform/i18n';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { getCursorAnimationOptions, getCursorPresetOptions } from './cursor-options';
import { InspectorDetails } from '../shared/details';
import { ColorField, SelectInput, ToggleField } from '../shared/controls';
import { DetailItem, DetailList, PANEL_META_CLASS_NAME } from '../shared/panel';
import { VideoCursorCaptureMode } from '../../../../../features/video/project/types';
import { SliderField } from '../shared/sliders';

type CursorTrackCaptureMode = NonNullable<
  NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>['captureMode']
>;

export function CursorPositionFields(props: { x: number; y: number }) {
  return (
    <DetailList>
      <DetailItem label="X" value={Math.round(props.x)} />
      <DetailItem label="Y" value={Math.round(props.y)} />
    </DetailList>
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
        label={translate('videoEditor.sidebar.inspectorSampleVisible')}
        onChange={props.onChange}
      />
    </div>
  );
}

export function CursorSkinFields(props: {
  part?: 'appearance' | 'animation';
  showCaptureCapability?: boolean;
  animationPreset: NonNullable<
    NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>['skin']
  >['animationPreset'];
  captureMode: CursorTrackCaptureMode;
  color: string;
  hidden: boolean;
  preset: NonNullable<
    NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>['skin']
  >['preset'];
  recentColors: WorkspaceSidebarSelectionPanelProps['recentColors'] | undefined;
  scale: number;
  shadow: boolean;
  onRememberRecentColor: WorkspaceSidebarSelectionPanelProps['onRememberRecentColor'] | undefined;
  onSetCursorCaptureMode: WorkspaceSidebarSelectionPanelProps['onSetCursorCaptureMode'];
  onUpdateCursorSkin: WorkspaceSidebarSelectionPanelProps['onUpdateCursorSkin'];
}) {
  if (props.captureMode === VideoCursorCaptureMode.EMBEDDED_FALLBACK) {
    return <CursorCaptureCapability captureMode={props.captureMode} />;
  }
  if (props.part === 'animation')
    return (
      <CursorAnimationField
        animationPreset={props.animationPreset}
        onUpdateCursorSkin={props.onUpdateCursorSkin}
      />
    );
  return (
    <div className="grid grid-cols-1 gap-3">
      {props.showCaptureCapability !== false ? (
        <CursorCaptureCapability captureMode={props.captureMode} />
      ) : null}
      <CursorAppearanceFields
        showAnimation={props.part !== 'appearance'}
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

function CursorCaptureCapability(props: { captureMode: CursorTrackCaptureMode }) {
  const embedded = props.captureMode === VideoCursorCaptureMode.EMBEDDED_FALLBACK;
  return (
    <div>
      <DetailList>
        <DetailItem
          label={translate('videoEditor.sidebar.cursorCaptureModeLabel')}
          value={translate(
            embedded
              ? 'videoEditor.sidebar.cursorCaptureModeFallback'
              : 'videoEditor.sidebar.cursorCaptureModeSeparate'
          )}
        />
      </DetailList>
      {embedded ? (
        <p className={`mt-1 ${PANEL_META_CLASS_NAME}`}>
          {translate('videoEditor.sidebar.cursorFallbackHint')}
        </p>
      ) : null}
    </div>
  );
}

function CursorAppearanceFields(props: {
  showAnimation: boolean;
  animationPreset: NonNullable<
    NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>['skin']
  >['animationPreset'];
  color: string;
  preset: NonNullable<
    NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>['skin']
  >['preset'];
  recentColors: WorkspaceSidebarSelectionPanelProps['recentColors'] | undefined;
  scale: number;
  onRememberRecentColor: WorkspaceSidebarSelectionPanelProps['onRememberRecentColor'] | undefined;
  onUpdateCursorSkin: WorkspaceSidebarSelectionPanelProps['onUpdateCursorSkin'];
}) {
  return (
    <div className="space-y-3">
      <CursorPresetField preset={props.preset} onUpdateCursorSkin={props.onUpdateCursorSkin} />
      {props.showAnimation ? (
        <>
          {' '}
          <CursorAnimationField
            animationPreset={props.animationPreset}
            onUpdateCursorSkin={props.onUpdateCursorSkin}
          />
        </>
      ) : null}
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
        checked={!props.hidden}
        label={translate('videoEditor.sidebar.cursorVisibleLabel')}
        onChange={(checked) => props.onUpdateCursorSkin({ hidden: !checked })}
      />
      <InspectorDetails label={translate('videoEditor.sidebar.inspectorMoreDetails')}>
        {' '}
        <CursorSkinToggle
          checked={props.shadow}
          label={translate('videoEditor.sidebar.cursorShadowLabel')}
          onChange={(checked) => props.onUpdateCursorSkin({ shadow: checked })}
        />
      </InspectorDetails>
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
