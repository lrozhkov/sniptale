import { useState } from 'react';
import type { TourDocument, TourImageSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
import { ScanSearch } from 'lucide-react';
import { GuideInspectorGroup } from '../inspector';
import { CompactSelect } from '../../../ui/compact-inspector-controls/select';
import { NumericRow } from '../../../ui/compact-inspector-controls/numeric';
import {
  resolveTourCamera,
  tourCameraEnabled,
} from '../../../features/scenario/tour-player/camera';
import type { Translate } from '../../../platform/i18n';

/** Camera settings describe an entrance, while canvas framing and preview stay disposable. */
export function TourCameraSettings({
  slide,
  tour,
  disabled,
  onChange,
  t,
}: {
  slide: TourImageSlide;
  tour: TourDocument;
  disabled: boolean;
  onChange: (slide: TourImageSlide, group?: string | null) => boolean;
  t: Translate;
}) {
  const locked = disabled || !slide.image;
  const camera = slide.camera;
  const automatic = camera.mode === 'auto' || (camera.mode === 'inherit' && tour.playback.autoZoom);
  const enabled = tourCameraEnabled(slide, tour.playback.autoZoom);
  const [width, height] = tour.stage.aspect.split(':').map(Number);
  const zoom =
    resolveTourCamera(
      slide,
      { stageWidth: width! * 100, stageHeight: height! * 100 },
      tour.playback.autoZoom
    )?.zoom ?? 1;
  return (
    <GuideInspectorGroup icon={ScanSearch} title={t('scenario.editor.tourCamera')}>
      <CompactSelect
        aria-label={t('scenario.editor.tourCameraMode')}
        value={camera.mode}
        disabled={locked}
        options={[
          { value: 'inherit', label: t('scenario.editor.tourInherited') },
          { value: 'off', label: t('scenario.editor.tourCameraOff') },
          { value: 'auto', label: t('scenario.editor.tourCameraAuto') },
          { value: 'manual', label: t('scenario.editor.tourCameraManual') },
        ]}
        onChange={(mode) => onChange({ ...slide, camera: { ...camera, mode } })}
      />
      {automatic && !enabled && (
        <p className="guide-inspector-hint">{t('scenario.editor.tourCameraOneTarget')}</p>
      )}
      {enabled && (
        <>
          <CameraAmount
            key={`${slide.id}:zoom:${camera.mode}`}
            label={t('scenario.editor.tourCameraZoom')}
            value={zoom * 100}
            min={100}
            max={800}
            step={10}
            unit="%"
            disabled={locked}
            onChange={(amount) =>
              onChange({
                ...slide,
                camera: {
                  ...camera,
                  ...(automatic ? { targetZoom: amount / 100 } : { zoom: amount / 100 }),
                },
              })
            }
          />
          <CameraAmount
            key={`${slide.id}:delay`}
            label={t('scenario.editor.tourCameraDelay')}
            value={(camera.delayMs ?? 300) / 1000}
            min={0}
            max={5}
            step={0.1}
            unit="s"
            disabled={locked}
            onChange={(amount) =>
              onChange({ ...slide, camera: { ...camera, delayMs: Math.round(amount * 1000) } })
            }
          />
          <CameraAmount
            key={`${slide.id}:duration`}
            label={t('scenario.editor.tourCameraDuration')}
            value={(camera.durationMs ?? 700) / 1000}
            min={0.1}
            max={5}
            step={0.1}
            unit="s"
            disabled={locked}
            onChange={(amount) =>
              onChange({ ...slide, camera: { ...camera, durationMs: Math.round(amount * 1000) } })
            }
          />
          <p className="guide-inspector-hint">{t('scenario.editor.tourCameraAnimationHint')}</p>
          {camera.mode === 'manual' && (
            <p className="guide-inspector-hint">{t('scenario.editor.tourCameraFrameHint')}</p>
          )}
        </>
      )}
    </GuideInspectorGroup>
  );
}
function CameraAmount({
  onChange,
  ...props
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: '%' | 's';
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  return (
    <NumericRow
      {...props}
      appearance="plain"
      value={preview ?? props.value}
      precision={props.unit === '%' ? 0 : 1}
      scrub={{ min: props.min, max: props.max, step: props.step }}
      onPreviewValue={setPreview}
      onCommitValue={(value) => {
        setPreview(null);
        onChange(value);
      }}
    />
  );
}
