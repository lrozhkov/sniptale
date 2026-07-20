import type { VideoProject } from '../../../../features/video/project/types/index';
import {
  getShapePreviewClipStyle,
  getTextPreviewClipStyle,
  isVideoConnectorShapeClip,
} from '../canvas/clip-layout';
import type { ShapePreviewClipParams, TextPreviewClipParams } from './shared';

export function renderTextPreviewClip({
  clip,
  commonStyle,
  onBeginInteraction,
  project,
  selectedClipId,
}: TextPreviewClipParams & { project: VideoProject }) {
  return (
    <button
      key={clip.id}
      type="button"
      style={getTextPreviewClipStyle(project, clip, commonStyle)}
      className={
        selectedClipId === clip.id
          ? 'overflow-hidden border shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]'
          : 'overflow-hidden border'
      }
      onPointerDown={(event) => onBeginInteraction(event, clip, 'move')}
    >
      <span className="block whitespace-pre-wrap break-words">{clip.text}</span>
    </button>
  );
}

export function renderShapePreviewClip({
  clip,
  commonStyle,
  onBeginInteraction,
  selectedClipId,
}: ShapePreviewClipParams) {
  const selected = selectedClipId === clip.id;

  return (
    <button
      key={clip.id}
      type="button"
      style={getShapePreviewClipStyle(clip, commonStyle)}
      className={resolveShapePreviewClipClassName({
        connector: isVideoConnectorShapeClip(clip),
        selected,
      })}
      onPointerDown={(event) => onBeginInteraction(event, clip, 'move')}
    >
      {isVideoConnectorShapeClip(clip) ? <VideoConnectorShapeSvg clip={clip} /> : null}
    </button>
  );
}

function VideoConnectorShapeSvg({ clip }: Pick<ShapePreviewClipParams, 'clip'>) {
  const markerId = `video-preview-arrow-${clip.id}`;
  const isArrow = clip.shapeType === 'ARROW';

  return (
    <svg
      aria-hidden
      className="absolute inset-0 overflow-visible"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      {isArrow ? (
        <defs>
          <marker
            id={markerId}
            markerHeight="8"
            markerWidth="8"
            orient="auto"
            refX="7"
            refY="4"
            viewBox="0 0 8 8"
          >
            <path d="M0 0L8 4L0 8Z" fill={clip.style.strokeColor} />
          </marker>
        </defs>
      ) : null}
      <line
        x1="0"
        x2="100"
        y1="50"
        y2="50"
        stroke={clip.style.strokeColor}
        strokeLinecap="round"
        strokeWidth={clip.style.strokeWidth}
        vectorEffect="non-scaling-stroke"
        {...(isArrow ? { markerEnd: `url(#${markerId})` } : {})}
      />
    </svg>
  );
}

function resolveShapePreviewClipClassName(args: { connector: boolean; selected: boolean }) {
  const selectedClassName =
    'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]';
  if (args.connector) {
    return ['overflow-visible', args.selected ? selectedClassName : null].filter(Boolean).join(' ');
  }

  return args.selected ? `border ${selectedClassName}` : 'border';
}
