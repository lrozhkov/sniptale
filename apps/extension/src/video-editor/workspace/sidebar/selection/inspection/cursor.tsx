import { translate } from '../../../../../platform/i18n';
import { InspectorActionButton } from '../shared/actions';
import {
  VideoCursorCaptureMode,
  VideoTemporalEasing,
} from '../../../../../features/video/project/types';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import {
  CursorPositionFields,
  CursorSkinFields,
  CursorVisibilityField,
} from '../effect-controls/cursor-fields';
import { DangerButton, TemporalEasingSelect } from '../effect-controls/fields';
import { InspectorGroupedPanel } from '../grouped-inspector';
import { SelectionEmptyState } from './helpers';
import { DetailItem, DetailList, PANEL_SECTION_CLASS_NAME } from '../shared/panel';

export function InspectCursorPanel(props: WorkspaceSidebarSelectionPanelProps) {
  const sample = props.selectedCursorSample;
  const cursorTrack = props.project.cursorTrack;
  if (!sample || !cursorTrack) {
    return <SelectionEmptyState />;
  }

  const usesTrackAppearance = !sample.skinOverride;
  const effectiveSkin = sample.skinOverride ?? cursorTrack.skin;

  return (
    <section className={PANEL_SECTION_CLASS_NAME}>
      <InspectorGroupedPanel
        groups={createCursorGroups(props, sample, cursorTrack, usesTrackAppearance, effectiveSkin)}
      />
      <DangerButton
        className="mt-3"
        onClick={() => props.onDeleteCursorSample(sample.id)}
        label={translate('common.actions.delete')}
      />
    </section>
  );
}

function createCursorGroups(
  props: WorkspaceSidebarSelectionPanelProps,
  sample: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedCursorSample']>,
  cursorTrack: NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>,
  usesTrackAppearance: boolean,
  effectiveSkin: NonNullable<
    NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>['skin']
  >
) {
  return [
    {
      id: 'info',
      semantic: 'info' as const,
      label: translate('videoEditor.sidebar.inspectorGroupInfo'),
      content: (
        <CursorOverview
          appearanceMode={usesTrackAppearance ? 'track' : 'override'}
          time={sample.time}
          x={sample.x}
          y={sample.y}
        />
      ),
    },
    {
      id: 'behavior',
      semantic: 'animation' as const,
      label: translate('videoEditor.sidebar.inspectorGroupAnimation'),
      content: (
        <>
          <CursorBehaviorSection {...createCursorBehaviorProps(props, sample)} />
          <CursorSkinFields
            {...createCursorAppearanceProps(props, sample, cursorTrack, usesTrackAppearance)}
            part="animation"
            animationPreset={effectiveSkin.animationPreset}
            color={effectiveSkin.color}
            hidden={effectiveSkin.hidden}
            preset={effectiveSkin.preset}
            scale={effectiveSkin.scale}
            shadow={effectiveSkin.shadow}
            onUpdateCursorSkin={resolveCursorSkinUpdater({
              ...createCursorAppearanceProps(props, sample, cursorTrack, usesTrackAppearance),
              skin: effectiveSkin,
            })}
            showCaptureCapability={false}
          />
        </>
      ),
    },
    {
      id: 'appearance',
      semantic: 'appearance' as const,
      defaultActive: true,
      label: translate('videoEditor.sidebar.inspectorGroupAppearance'),
      content: (
        <>
          <CursorVisibilityField
            visible={sample.visible}
            onChange={(visible) => props.onUpdateCursorSampleVisibility(sample.id, visible)}
          />
          <CursorAppearanceSection
            {...createCursorAppearanceProps(props, sample, cursorTrack, usesTrackAppearance)}
            skin={effectiveSkin}
          />
        </>
      ),
    },
  ] as const;
}

function createCursorBehaviorProps(
  props: WorkspaceSidebarSelectionPanelProps,
  sample: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedCursorSample']>
) {
  return {
    sample,
    canInterpolate: props.project.cursorTrack?.captureMode === VideoCursorCaptureMode.SEPARATE,
    onUpdateCursorSampleInterpolation: props.onUpdateCursorSampleInterpolation,
    onUpdateCursorSampleVisibility: props.onUpdateCursorSampleVisibility,
  };
}

function createCursorAppearanceProps(
  props: WorkspaceSidebarSelectionPanelProps,
  sample: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedCursorSample']>,
  cursorTrack: NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>,
  usesTrackAppearance: boolean
) {
  return {
    captureMode: cursorTrack.captureMode,
    recentColors: props.recentColors,
    sampleId: sample.id,
    usesTrackAppearance,
    onClearCursorSampleSkinOverride: props.onClearCursorSampleSkinOverride,
    onRememberRecentColor: props.onRememberRecentColor,
    onSetCursorCaptureMode: props.onSetCursorCaptureMode,
    onUpdateCursorSampleSkinOverride: props.onUpdateCursorSampleSkinOverride,
    onUpdateCursorSkin: props.onUpdateCursorSkin,
  };
}

function CursorBehaviorSection(props: {
  canInterpolate: boolean;
  sample: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedCursorSample']>;
  onUpdateCursorSampleInterpolation: WorkspaceSidebarSelectionPanelProps['onUpdateCursorSampleInterpolation'];
  onUpdateCursorSampleVisibility: WorkspaceSidebarSelectionPanelProps['onUpdateCursorSampleVisibility'];
}) {
  return (
    <div className="space-y-3">
      {props.canInterpolate ? (
        <TemporalEasingSelect
          label={translate('videoEditor.sidebar.cursorInterpolationLabel')}
          value={props.sample.interpolation ?? VideoTemporalEasing.LINEAR}
          onChange={(value) => props.onUpdateCursorSampleInterpolation(props.sample.id, value)}
        />
      ) : null}
    </div>
  );
}

function CursorAppearanceSection(props: {
  captureMode: NonNullable<
    NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>['captureMode']
  >;
  recentColors: WorkspaceSidebarSelectionPanelProps['recentColors'];
  sampleId: string;
  skin: NonNullable<
    NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>['skin']
  >;
  usesTrackAppearance: boolean;
  onClearCursorSampleSkinOverride: WorkspaceSidebarSelectionPanelProps['onClearCursorSampleSkinOverride'];
  onRememberRecentColor: WorkspaceSidebarSelectionPanelProps['onRememberRecentColor'];
  onSetCursorCaptureMode: WorkspaceSidebarSelectionPanelProps['onSetCursorCaptureMode'];
  onUpdateCursorSampleSkinOverride: WorkspaceSidebarSelectionPanelProps['onUpdateCursorSampleSkinOverride'];
  onUpdateCursorSkin: WorkspaceSidebarSelectionPanelProps['onUpdateCursorSkin'];
}) {
  return (
    <>
      <CursorAppearanceModeButton
        sampleId={props.sampleId}
        skin={props.skin}
        usesTrackAppearance={props.usesTrackAppearance}
        onClearCursorSampleSkinOverride={props.onClearCursorSampleSkinOverride}
        onUpdateCursorSampleSkinOverride={props.onUpdateCursorSampleSkinOverride}
      />
      <div className="mt-3">
        <CursorSkinFields
          part="appearance"
          showCaptureCapability={true}
          animationPreset={props.skin.animationPreset}
          captureMode={props.captureMode}
          color={props.skin.color}
          hidden={props.skin.hidden}
          preset={props.skin.preset}
          recentColors={props.recentColors}
          scale={props.skin.scale}
          shadow={props.skin.shadow}
          onRememberRecentColor={props.onRememberRecentColor}
          onSetCursorCaptureMode={props.onSetCursorCaptureMode}
          onUpdateCursorSkin={resolveCursorSkinUpdater(props)}
        />
      </div>
    </>
  );
}

function resolveCursorSkinUpdater(props: {
  sampleId: string;
  skin: NonNullable<
    NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>['skin']
  >;
  usesTrackAppearance: boolean;
  onUpdateCursorSampleSkinOverride: WorkspaceSidebarSelectionPanelProps['onUpdateCursorSampleSkinOverride'];
  onUpdateCursorSkin: WorkspaceSidebarSelectionPanelProps['onUpdateCursorSkin'];
}) {
  return props.usesTrackAppearance
    ? props.onUpdateCursorSkin
    : (patch: Partial<typeof props.skin>) =>
        props.onUpdateCursorSampleSkinOverride(props.sampleId, patch);
}

function CursorAppearanceModeButton(props: {
  sampleId: string;
  skin: NonNullable<
    NonNullable<WorkspaceSidebarSelectionPanelProps['project']['cursorTrack']>['skin']
  >;
  usesTrackAppearance: boolean;
  onClearCursorSampleSkinOverride: WorkspaceSidebarSelectionPanelProps['onClearCursorSampleSkinOverride'];
  onUpdateCursorSampleSkinOverride: WorkspaceSidebarSelectionPanelProps['onUpdateCursorSampleSkinOverride'];
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <InspectorActionButton
        compact
        tone="primary"
        onClick={() => {
          if (props.usesTrackAppearance) {
            props.onUpdateCursorSampleSkinOverride(props.sampleId, props.skin);
            return;
          }

          props.onClearCursorSampleSkinOverride(props.sampleId);
        }}
      >
        {translate(
          props.usesTrackAppearance
            ? 'videoEditor.sidebar.cursorAppearanceUnlink'
            : 'videoEditor.sidebar.cursorAppearanceRestoreTrack'
        )}
      </InspectorActionButton>
    </div>
  );
}

function CursorOverview(props: {
  appearanceMode: 'override' | 'track';
  time: number;
  x: number;
  y: number;
}) {
  return (
    <>
      <CursorPositionFields x={props.x} y={props.y} />
      <div className="mt-3">
        <DetailList>
          <DetailItem
            label={translate('videoEditor.sidebar.actionTimePrefix')}
            value={`${props.time.toFixed(2)} s`}
          />
          <DetailItem
            label={translate('videoEditor.sidebar.cursorAppearanceModeLabel')}
            value={translate(
              props.appearanceMode === 'track'
                ? 'videoEditor.sidebar.cursorAppearanceModeTrack'
                : 'videoEditor.sidebar.cursorAppearanceModeOverride'
            )}
          />
        </DetailList>
      </div>
    </>
  );
}
