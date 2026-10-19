import { useContext } from 'react';
import { RotateCcw } from 'lucide-react';
import type { MediaSourceCrop } from '../../../../../features/video/project/media-crop';
import { getMediaClipSourceTime } from '../../../../../features/video/project/timeline/rate';
import type {
  VideoProject,
  VideoProjectVideoClip,
  VideoProjectImageClip,
} from '../../../../../features/video/project/types';
import type { VideoEditorMediaClipEdit } from '../../../../contracts/commands/patches';
import { RuntimePreviewContext } from '../../../../runtime/controller/composition/contexts';
import { NumericRow } from '../../../../../ui/compact-inspector-controls';
import { translate } from '../../../../../platform/i18n';
import { InspectorDetails } from '../shared/details';
import { InspectorActionButton } from '../shared/actions';
import { MediaCropPreview } from './media-crop-preview';

const WHOLE_SOURCE: MediaSourceCrop = { x: 0, y: 0, width: 1, height: 1 };

export function MediaCropControls(props: {
  project: VideoProject;
  clip: VideoProjectVideoClip | VideoProjectImageClip;
  currentTime: number;
  disabled: boolean;
  onEdit?: ((clipId: string, edit: VideoEditorMediaClipEdit) => void) | undefined;
}) {
  const runtime = useContext(RuntimePreviewContext);
  const crop = props.clip.sourceCrop ?? WHOLE_SOURCE;
  const asset = props.project.assets.find((asset) => asset.id === props.clip.assetId);
  const disabled = props.disabled || !props.onEdit;
  const change = (value: MediaSourceCrop) =>
    props.onEdit?.(props.clip.id, { kind: 'source-crop', crop: value });
  const fields = [
    {
      key: 'x',
      label: translate('videoEditor.sidebar.mediaCropLeft'),
      min: 0,
      max: 1 - crop.width,
    },
    {
      key: 'y',
      label: translate('videoEditor.sidebar.mediaCropTop'),
      min: 0,
      max: 1 - crop.height,
    },
    {
      key: 'width',
      label: translate('videoEditor.sidebar.mediaCropWidth'),
      min: 7680 / Number.MAX_VALUE,
      max: 1 - crop.x,
    },
    {
      key: 'height',
      label: translate('videoEditor.sidebar.mediaCropHeight'),
      min: 7680 / Number.MAX_VALUE,
      max: 1 - crop.y,
    },
  ] as const;
  return (
    <InspectorDetails
      preferenceId="media-frame:source-crop"
      label={translate('videoEditor.sidebar.mediaCrop')}
    >
      <div className="sniptale-parameter-stack space-y-1" data-ui="video-editor.media-crop">
        <MediaCropPreview
          key={`${props.clip.id}:${runtime?.assetUrls[props.clip.assetId] ?? ''}`}
          url={runtime?.assetUrls[props.clip.assetId]}
          kind={props.clip.type}
          width={asset?.metadata.width ?? 1}
          height={asset?.metadata.height ?? 1}
          sourceTime={
            props.clip.type === 'VIDEO' ? getMediaClipSourceTime(props.clip, props.currentTime) : 0
          }
          crop={crop}
          disabled={disabled}
          onChange={change}
        />
        {fields.map((field) => (
          <NumericRow
            key={field.key}
            label={field.label}
            value={crop[field.key] * 100}
            min={Math.min(field.min, crop[field.key]) * 100}
            max={Math.max(field.max, crop[field.key]) * 100}
            step={0.1}
            precision={2}
            unit="%"
            disabled={disabled}
            normalizeValue={(value) =>
              value === Number((crop[field.key] * 100).toFixed(2)) ? crop[field.key] * 100 : value
            }
            onPreviewValue={() => undefined}
            onCommitValue={(value) => change({ ...crop, [field.key]: value / 100 })}
          />
        ))}
        <InspectorActionButton
          separated
          disabled={disabled || !props.clip.sourceCrop}
          onClick={() => props.onEdit?.(props.clip.id, { kind: 'source-crop', crop: null })}
        >
          <RotateCcw size={14} aria-hidden="true" />
          {translate('gallery.videoReview.sourceCropReset')}
        </InspectorActionButton>
      </div>
    </InspectorDetails>
  );
}
