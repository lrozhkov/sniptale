import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { VideoTemporalEasing } from '../../../../../features/video/project/types';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import {
  CursorPositionFields,
  CursorSkinFields,
  CursorVisibilityField,
} from '../effect-controls/cursor-fields';
import { DangerButton, TemporalEasingSelect } from '../effect-controls/fields';
import { InspectorGroupedPanel } from '../grouped-inspector';
import { SelectionEmptyState } from './helpers';
import {
  DetailItem,
  DetailList,
  PANEL_HEADING_CLASS_NAME,
  PANEL_META_CLASS_NAME,
  PANEL_SECTION_CLASS_NAME,
} from '../shared/panel';

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
        className="mt-3 w-full"
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
      label: translate('videoEditor.sidebar.inspectorGroupInfo'),
      content: (
        <CursorOverview
          appearanceMode={usesTrackAppearance ? 'track' : 'override'}
          time={sample.time}
        />
      ),
    },
    {
      id: 'behavior',
      label: translate('videoEditor.sidebar.inspectorGroupBehavior'),
      defaultActive: true,
      content: <CursorBehaviorSection {...createCursorBehaviorProps(props, sample)} />,
    },
    {
      id: 'appearance',
      label: translate('videoEditor.sidebar.inspectorGroupAppearance'),
      content: (
        <CursorAppearanceSection
          {...createCursorAppearanceProps(props, sample, cursorTrack, usesTrackAppearance)}
          skin={effectiveSkin}
        />
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
  sample: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedCursorSample']>;
  onUpdateCursorSampleInterpolation: WorkspaceSidebarSelectionPanelProps['onUpdateCursorSampleInterpolation'];
  onUpdateCursorSampleVisibility: WorkspaceSidebarSelectionPanelProps['onUpdateCursorSampleVisibility'];
}) {
  return (
    <div className="space-y-3">
      <CursorPositionFields x={props.sample.x} y={props.sample.y} />
      <CursorVisibilityField
        visible={props.sample.visible}
        onChange={(visible) => props.onUpdateCursorSampleVisibility(props.sample.id, visible)}
      />
      <TemporalEasingSelect
        label={translate('videoEditor.sidebar.cursorInterpolationLabel')}
        value={props.sample.interpolation ?? VideoTemporalEasing.LINEAR}
        onChange={(value) => props.onUpdateCursorSampleInterpolation(props.sample.id, value)}
      />
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
      <CursorAppearanceHeading usesTrackAppearance={props.usesTrackAppearance} />
      <CursorAppearanceModeButton
        sampleId={props.sampleId}
        skin={props.skin}
        usesTrackAppearance={props.usesTrackAppearance}
        onClearCursorSampleSkinOverride={props.onClearCursorSampleSkinOverride}
        onUpdateCursorSampleSkinOverride={props.onUpdateCursorSampleSkinOverride}
      />
      <div className="mt-3">
        <CursorSkinFields
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

function CursorAppearanceHeading(props: { usesTrackAppearance: boolean }) {
  return (
    <div className="mt-3">
      <p className={PANEL_HEADING_CLASS_NAME}>
        {translate('videoEditor.sidebar.cursorTrackAppearanceTitle')}
      </p>
      <p className={`mt-1 ${PANEL_META_CLASS_NAME}`}>
        {translate(
          props.usesTrackAppearance
            ? 'videoEditor.sidebar.cursorAppearanceTrackLinkHint'
            : 'videoEditor.sidebar.cursorAppearanceOverrideHint'
        )}
      </p>
    </div>
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
      <ProductActionButton
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
      </ProductActionButton>
    </div>
  );
}

function CursorOverview(props: { appearanceMode: 'override' | 'track'; time: number }) {
  return (
    <>
      <p className={PANEL_HEADING_CLASS_NAME}>{translate('videoEditor.timeline.cursorLane')}</p>
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
