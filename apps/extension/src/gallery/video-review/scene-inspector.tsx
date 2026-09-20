import { translate } from '../../platform/i18n';
import { SelectField } from '../../ui/compact-inspector-controls';
import { ReviewNumberRow } from './number-row';
import { reviewSelectFieldClassName } from './controls';
import { quickEditCanvasPreset } from '../../features/video/review/advanced/canvas';
import type {
  QuickEditAudioState,
  QuickEditCanvasSize,
} from '../../features/video/review/advanced/types';

const FORMATS = [
  { id: 'wide', x: 16, y: 9 },
  { id: 'vertical', x: 9, y: 16 },
  { id: 'square', x: 1, y: 1 },
  { id: 'portrait', x: 4, y: 5 },
  { id: 'classic', x: 4, y: 3 },
] as const;
const RESOLUTIONS = [720, 1080, 1440, 2160] as const;

/** Explicit output canvas choices; native restores source dimensions without an override. */
export function ReviewCanvasSettings(props: {
  source: QuickEditCanvasSize;
  canvas: QuickEditCanvasSize | undefined;
  onChange(canvas: QuickEditCanvasSize | undefined): void;
}) {
  const size = props.canvas ?? props.source;
  const format = FORMATS.find(
    (item) => Math.abs(size.width / size.height - item.x / item.y) < 0.002
  );
  const resolutions = RESOLUTIONS.map((edge) => {
    const canvas = quickEditCanvasPreset(format?.x ?? size.width, format?.y ?? size.height, edge);
    return { value: String(edge), label: `${canvas.width} × ${canvas.height}`, canvas };
  });
  const resolution = resolutions.find(
    (item) => item.canvas.width === size.width && item.canvas.height === size.height
  );
  return (
    <section className="space-y-3" data-ui="gallery.videoReview.canvasSettings">
      <h4 className="text-sm font-semibold">{translate('gallery.videoReview.canvas')}</h4>
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('videoEditor.sidebar.canvasFormatLabel')}
        value={!props.canvas ? 'source' : (format?.id ?? 'custom')}
        options={[
          { value: 'source', label: translate('gallery.videoReview.canvasSource') },
          ...FORMATS.map((item) => ({ value: item.id, label: `${item.x}:${item.y}` })),
          ...(props.canvas && !format
            ? [{ value: 'custom', label: translate('videoEditor.sidebar.canvasCustom') }]
            : []),
        ]}
        onChange={(id) => {
          if (id === 'source') return props.onChange(undefined);
          const next = FORMATS.find((item) => item.id === id);
          if (next)
            props.onChange(
              quickEditCanvasPreset(next.x, next.y, Math.min(size.width, size.height))
            );
        }}
      />
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('videoEditor.sidebar.canvasResolutionLabel')}
        value={resolution?.value ?? 'current'}
        options={[
          ...resolutions,
          ...(!resolution ? [{ value: 'current', label: `${size.width} × ${size.height}` }] : []),
        ]}
        onChange={(value) => {
          const next = resolutions.find((item) => item.value === value);
          if (next) props.onChange(next.canvas);
        }}
      />
    </section>
  );
}

/** Lane masters preserve clip-level gains and remain separate from track visibility. */
export function ReviewSceneAudio(props: {
  audio: QuickEditAudioState;
  hasOriginalAudio: boolean;
  onOriginal(volume: number): void;
  onLaneVolume(lane: 'voiceover' | 'music', volume: number): void;
}) {
  const lanes = [
    ...(props.hasOriginalAudio
      ? [
          {
            key: 'original' as const,
            label: 'gallery.videoReview.audioOriginal' as const,
            volume: props.audio.original.volume,
          },
        ]
      : []),
    ...(['voiceover', 'music'] as const)
      .filter((lane) => props.audio[lane].length > 0)
      .map((lane) => ({
        key: lane,
        label:
          lane === 'voiceover'
            ? ('gallery.videoReview.audioVoiceover' as const)
            : ('gallery.videoReview.audioMusic' as const),
        volume: props.audio.laneVolumes?.[lane] ?? 1,
      })),
  ];
  if (!lanes.length) return null;
  return (
    <section className="space-y-2" data-ui="gallery.videoReview.sceneAudio">
      <h4 className="text-sm font-semibold">{translate('gallery.videoReview.volume')}</h4>
      {lanes.map((lane) => {
        const change = (value: number) =>
          lane.key === 'original'
            ? props.onOriginal(value / 100)
            : props.onLaneVolume(lane.key, value / 100);
        return (
          <ReviewNumberRow
            key={lane.key}
            label={translate(lane.label)}
            unit="%"
            value={Math.round(lane.volume * 100)}
            min={0}
            max={200}
            step={1}
            onChange={change}
          />
        );
      })}
    </section>
  );
}
