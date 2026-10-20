import { useEffect } from 'react';
import {
  DEFAULT_CAMERA_DEPTH,
  DEFAULT_CAMERA_PERSPECTIVE,
  type MotionSpatialEdit,
} from '../../../../../features/video/project/motion/spatial';
import type { VideoProjectMotionRegion } from '../../../../../features/video/project/types';
import { translate } from '../../../../../platform/i18n';
import { PreviewNumericRow } from '../../../../../ui/compact-inspector-controls/numeric-preview';
import { ToggleField } from '../../../../../ui/compact-inspector-controls';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { InspectorActionButton } from '../shared/actions';
import { OptionButtonsField } from '../shared/option-buttons';

type SpatialFieldProps = {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
};

/** Commands use accepted settings; only the presentation receives a gesture draft. */
function useMotionSpatialEditing({ motionRegion, panel }: SpatialFieldProps) {
  const project = panel.typingProject ?? panel.project;
  const preview = panel.onPreviewMotion;
  useEffect(() => () => preview?.(null), [preview, project, motionRegion.id]);
  return {
    presented:
      panel.project.motionRegions?.find((region) => region.id === motionRegion.id) ?? motionRegion,
    preview: (edit: MotionSpatialEdit | null) =>
      preview?.(edit ? { project, regionId: motionRegion.id, kind: 'spatial', edit } : null),
    commit: (edit: MotionSpatialEdit) => {
      preview?.(null);
      panel.onUpdateMotionRegion(motionRegion.id, { spatialEdit: edit });
    },
  };
}

const perspectiveLabels = {
  rotateX: 'gallery.videoReview.perspectiveX',
  rotateY: 'gallery.videoReview.perspectiveY',
  rotateZ: 'gallery.videoReview.perspectiveZ',
  strength: 'gallery.videoReview.perspectiveStrength',
} as const;

export function MotionPerspectiveFields(props: SpatialFieldProps) {
  const editing = useMotionSpatialEditing(props);
  const accepted = props.motionRegion.perspective ?? DEFAULT_CAMERA_PERSPECTIVE;
  const displayed = editing.presented.perspective ?? DEFAULT_CAMERA_PERSPECTIVE;
  return (
    <div className="sniptale-parameter-stack" data-ui="video-editor.motion.perspective">
      <ToggleField
        label={translate('gallery.videoReview.spatialEnabled')}
        value={accepted.enabled}
        onChange={(enabled) => editing.commit({ kind: 'perspective', enabled })}
      />
      {(Object.keys(perspectiveLabels) as Array<keyof typeof perspectiveLabels>).map((key) => {
        const angle = key !== 'strength';
        const factor = angle ? 1 : 100;
        const limit = key === 'rotateZ' ? 180 : 60;
        return (
          <PreviewNumericRow
            key={key}
            enterBehavior="blur"
            label={translate(perspectiveLabels[key])}
            value={accepted[key] * factor}
            previewValue={displayed[key] * factor}
            unit={angle ? 'deg' : '%'}
            min={angle ? -limit : 0}
            max={angle ? limit : 100}
            step={0.1}
            precision={1}
            disabled={!accepted.enabled}
            onPreview={(value) =>
              editing.preview(
                value === null ? null : { kind: 'perspective', [key]: value / factor }
              )
            }
            onChange={(value) => editing.commit({ kind: 'perspective', [key]: value / factor })}
          />
        );
      })}
      <InspectorActionButton
        onClick={() => editing.commit({ kind: 'perspective', ...DEFAULT_CAMERA_PERSPECTIVE })}
      >
        {translate('gallery.videoReview.spatialReset')}
      </InspectorActionButton>
    </div>
  );
}

const depthLabels = {
  strength: 'gallery.videoReview.depthStrength',
  softness: 'gallery.videoReview.depthSoftness',
  x: 'gallery.videoReview.depthX',
  y: 'gallery.videoReview.depthY',
  width: 'gallery.videoReview.depthWidth',
} as const;

export function MotionDepthFields(props: SpatialFieldProps) {
  const editing = useMotionSpatialEditing(props);
  const accepted = props.motionRegion.depthOfField ?? DEFAULT_CAMERA_DEPTH;
  const displayed = editing.presented.depthOfField ?? DEFAULT_CAMERA_DEPTH;
  return (
    <div className="sniptale-parameter-stack" data-ui="video-editor.motion.depth">
      <ToggleField
        label={translate('gallery.videoReview.spatialEnabled')}
        value={accepted.enabled}
        onChange={(enabled) => editing.commit({ kind: 'depth', enabled })}
      />
      <OptionButtonsField
        label={translate('gallery.videoReview.depthMode')}
        value={accepted.mode}
        disabled={!accepted.enabled}
        layout="stacked"
        options={[
          { value: 'depth', label: translate('gallery.videoReview.depthModeDepth') },
          { value: 'area', label: translate('gallery.videoReview.depthModeArea') },
        ]}
        onChange={(mode) => editing.commit({ kind: 'depth', mode })}
      />
      {(Object.keys(depthLabels) as Array<keyof typeof depthLabels>).map((key) => (
        <PreviewNumericRow
          key={key}
          enterBehavior="blur"
          label={translate(depthLabels[key])}
          value={accepted[key] * 100}
          previewValue={displayed[key] * 100}
          unit="%"
          min={key === 'softness' ? 1 : 0}
          max={100}
          step={0.1}
          precision={1}
          disabled={!accepted.enabled}
          onPreview={(value) =>
            editing.preview(value === null ? null : { kind: 'depth', [key]: value / 100 })
          }
          onChange={(value) => editing.commit({ kind: 'depth', [key]: value / 100 })}
        />
      ))}
      <InspectorActionButton
        onClick={() => editing.commit({ kind: 'depth', ...DEFAULT_CAMERA_DEPTH })}
      >
        {translate('gallery.videoReview.spatialReset')}
      </InspectorActionButton>
    </div>
  );
}

const referenceLabels = {
  x: 'videoEditor.sidebar.motionAreaXLabel',
  y: 'videoEditor.sidebar.motionAreaYLabel',
  width: 'videoEditor.sidebar.widthLabel',
  height: 'videoEditor.sidebar.heightLabel',
} as const;
const FULL_REFERENCE = { x: 0, y: 0, width: 1, height: 1 };

export function MotionSpatialReferenceFields(props: SpatialFieldProps) {
  const editing = useMotionSpatialEditing(props);
  const accepted = props.motionRegion.spatialReference ?? FULL_REFERENCE;
  const displayed = editing.presented.spatialReference ?? FULL_REFERENCE;
  const limits = {
    x: 1 - accepted.width,
    y: 1 - accepted.height,
    width: 1 - accepted.x,
    height: 1 - accepted.y,
  };
  return (
    <div className="sniptale-parameter-stack" data-ui="video-editor.motion.spatial-reference">
      {(Object.keys(referenceLabels) as Array<keyof typeof referenceLabels>).map((key) => (
        <PreviewNumericRow
          key={key}
          enterBehavior="blur"
          label={translate(referenceLabels[key])}
          value={accepted[key] * 100}
          previewValue={displayed[key] * 100}
          unit="%"
          min={key === 'width' || key === 'height' ? Number.MIN_VALUE : 0}
          max={limits[key] * 100}
          step={0.1}
          precision={1}
          onPreview={(value) =>
            editing.preview(value === null ? null : { kind: 'reference', [key]: value / 100 })
          }
          onChange={(value) => editing.commit({ kind: 'reference', [key]: value / 100 })}
        />
      ))}
      <InspectorActionButton
        disabled={!props.motionRegion.spatialReference}
        onClick={() => editing.commit({ kind: 'reference', reset: true })}
      >
        {translate('videoEditor.sidebar.spatialReferenceReset')}
      </InspectorActionButton>
    </div>
  );
}
