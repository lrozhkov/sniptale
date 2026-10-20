import { WindowHeaderSettings } from '../../workflows/browser-frame/settings';
import { useEffect, useRef, useState } from 'react';
import { translate } from '../../platform/i18n';
import { SelectField, SegmentedRow } from '../../ui/compact-inspector-controls';
import { DraftNumericRow as ReviewNumberRow } from '../../ui/compact-inspector-controls/numeric-preview';
import { reviewSelectFieldClassName } from './controls';
import {
  quickEditCanvasPreset,
  fitQuickEditSourceCrop,
} from '../../features/video/review/advanced/canvas';
import { ReviewSourceCropEditor } from './source-crop-editor';
import { ReviewButton } from './controls';
import type {
  QuickEditAudioState,
  QuickEditCanvasSize,
  QuickEditWindowHeader,
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
  cropPreview?: { file: File; time: number } | undefined;
  onChange(canvas: QuickEditCanvasSize | undefined): void;
}) {
  const [editing, setEditing] = useState(false);
  const section = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);
  const closeCrop = () => {
    restoreFocus.current = true;
    setEditing(false);
  };
  useEffect(() => {
    if (editing || !restoreFocus.current) return;
    restoreFocus.current = false;
    section.current
      ?.querySelector<HTMLButtonElement>('[data-ui="gallery.videoReview.sourceCropEdit"]')
      ?.focus();
  }, [editing]);
  const native = quickEditCanvasPreset(
    props.source.width,
    props.source.height,
    Math.min(props.source.width, props.source.height)
  );
  const size = props.canvas ?? native;
  const changeSize = (next: QuickEditCanvasSize | undefined) => {
    setEditing(false);
    const selected = next ?? native;
    props.onChange(
      props.canvas?.crop
        ? { ...selected, crop: fitQuickEditSourceCrop(props.source, selected, props.canvas.crop) }
        : next
    );
  };
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
    <section
      ref={section}
      className="review-inspector-columns"
      data-ui="gallery.videoReview.canvasSettings"
    >
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('videoEditor.sidebar.canvasFormatLabel')}
        value={
          !props.canvas || (size.width === native.width && size.height === native.height)
            ? 'source'
            : (format?.id ?? 'custom')
        }
        options={[
          { value: 'source', label: translate('gallery.videoReview.canvasSource') },
          ...FORMATS.map((item) => ({ value: item.id, label: `${item.x}:${item.y}` })),
          ...(props.canvas && !format
            ? [{ value: 'custom', label: translate('videoEditor.sidebar.canvasCustom') }]
            : []),
        ]}
        onChange={(id) => {
          if (id === 'source') return changeSize(undefined);
          const next = FORMATS.find((item) => item.id === id);
          if (next)
            changeSize(quickEditCanvasPreset(next.x, next.y, Math.min(size.width, size.height)));
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
          if (next) changeSize(next.canvas);
        }}
      />
      <SegmentedRow
        columns={2}
        label={translate('gallery.videoReview.sourceCropMode')}
        layout="stacked"
        ariaLabel={translate('gallery.videoReview.sourceCropMode')}
        value={props.canvas?.crop ? 'crop' : 'fit'}
        options={[
          { value: 'fit', label: translate('gallery.videoReview.sourceCropFit') },
          { value: 'crop', label: translate('gallery.videoReview.sourceCropEnable') },
        ]}
        onChange={(mode) => {
          setEditing(false);
          props.onChange({
            width: size.width,
            height: size.height,
            ...(mode === 'crop' ? { crop: fitQuickEditSourceCrop(props.source, size) } : {}),
          });
        }}
      />
      {props.canvas?.crop && props.cropPreview ? (
        <>
          {editing ? (
            <ReviewSourceCropEditor
              file={props.cropPreview.file}
              source={props.source}
              sourceTime={props.cropPreview.time}
              canvas={props.canvas}
              onCancel={closeCrop}
              onApply={(crop) => {
                props.onChange({ ...props.canvas!, crop });
                closeCrop();
              }}
            />
          ) : (
            <ReviewButton
              label={translate('gallery.videoReview.sourceCropEdit')}
              data-ui="gallery.videoReview.sourceCropEdit"
              onClick={() => setEditing(true)}
            />
          )}
        </>
      ) : null}
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
    <section className="review-inspector-columns" data-ui="gallery.videoReview.sceneAudio">
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

/** A source-window decoration, independent of the background and selected effect. */
export function ReviewWindowHeaderSettings(props: {
  header: QuickEditWindowHeader | undefined;
  onChange?: ((header: QuickEditWindowHeader | undefined) => void) | undefined;
}) {
  return (
    <section data-ui="gallery.videoReview.windowHeader">
      <WindowHeaderSettings header={props.header} onChange={(header) => props.onChange?.(header)} />
    </section>
  );
}
