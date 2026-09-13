import type { TourDocument, TourImageSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
import { ScanSearch } from 'lucide-react';
import { GuideInspectorGroup } from '../inspector';
import { CompactSelect } from '../../../ui/compact-inspector-controls/select';
import { NumericRow } from '../../../ui/compact-inspector-controls/numeric';
import { TourPointFields } from './fields';
import type { Translate } from '../../../platform/i18n';

/** Camera controls retain source coordinates; shared projection clamps the visible image. */
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
  const changeZoom = (zoom: number) =>
    onChange({ ...slide, camera: { ...camera, zoom } }, `tour-camera:${slide.id}`);
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
      {automatic && slide.hotspots.length !== 1 && (
        <p className="guide-inspector-hint">{t('scenario.editor.tourCameraOneTarget')}</p>
      )}
      {camera.mode === 'manual' && (
        <>
          <NumericRow
            label={t('scenario.editor.tourCameraZoom')}
            value={camera.zoom}
            min={1}
            max={8}
            precision={2}
            step={0.1}
            disabled={locked}
            onPreviewValue={changeZoom}
            onCommitValue={changeZoom}
          />
          <TourPointFields
            point={camera.center}
            disabled={locked}
            onChange={(center) => onChange({ ...slide, camera: { ...camera, center } })}
          />
          <p className="guide-inspector-hint">{t('scenario.editor.tourCameraBounds')}</p>
        </>
      )}
    </GuideInspectorGroup>
  );
}
