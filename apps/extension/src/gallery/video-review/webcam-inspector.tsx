import { Camera, Clock3, Move, Plus, Trash2 } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { SelectField } from '../../ui/compact-inspector-controls';
import { ReviewInspectorSections } from './inspector-sections';
import { ReviewNumberRow } from './number-row';
import {
  ReviewButton,
  ReviewInterval,
  reviewDeleteButtonClassName,
  reviewSelectFieldClassName,
  reviewTextButtonClassName,
} from './controls';
import type { useReviewWebcamEditor } from './webcam-editor';
import type { QuickEditWebcamPlacement } from '../../features/video/review/advanced/webcam';

type Editor = ReturnType<typeof useReviewWebcamEditor>;

function placementPreset(placement: QuickEditWebcamPlacement) {
  if (placement.width === 1 && placement.height === 1) return 'full';
  const near = (a: number, b: number) => Math.abs(a - b) < 0.00001;
  const horizontal = near(placement.x, Math.min(0.03, 1 - placement.width))
    ? 'left'
    : near(placement.x, Math.max(0, 0.97 - placement.width))
      ? 'right'
      : null;
  const vertical = near(placement.y, Math.min(0.03, 1 - placement.height))
    ? 'top'
    : near(placement.y, Math.max(0, 0.97 - placement.height))
      ? 'bottom'
      : null;
  return horizontal && vertical ? `${vertical}-${horizontal}` : 'custom';
}

/** Camera settings follow the active authored position; timing remains source-relative. */
export function ReviewWebcamInspector({
  editor,
  range,
}: {
  editor: Editor;
  range?: { start: number; end: number } | undefined;
}) {
  const camera = editor.camera;
  if (!camera) return null;
  return (
    <div className="space-y-3" data-ui="gallery.videoReview.webcamInspector">
      {editor.candidate ? (
        <div
          className="truncate text-xs text-[var(--sniptale-color-text-secondary)]"
          title={editor.candidate.filename}
        >
          {editor.candidate.filename}
        </div>
      ) : null}
      {editor.hidden ? (
        <>
          <ReviewInterval start={editor.hidden.start} end={editor.hidden.end} />
          {(['start', 'end'] as const).map((edge) => (
            <ReviewNumberRow
              key={edge}
              label={translate(
                edge === 'start' ? 'gallery.videoReview.rangeStart' : 'gallery.videoReview.rangeEnd'
              )}
              value={editor.hidden![edge]}
              min={edge === 'start' ? 0 : editor.hidden!.start + 0.001}
              max={edge === 'end' ? editor.duration : editor.hidden!.end - 0.001}
              step={0.01}
              precision={3}
              unit="s"
              onChange={(value) => editor.hide({ ...editor.hidden!, [edge]: value }, true)}
            />
          ))}
        </>
      ) : (
        <ReviewInspectorSections
          sections={[
            {
              id: 'webcam-layout',
              label: translate('gallery.videoReview.webcamLayout'),
              icon: Move,
              content: <WebcamLayout editor={editor} />,
            },
            {
              id: 'webcam-appearance',
              label: translate('gallery.videoReview.webcamAppearance'),
              icon: Camera,
              content: <WebcamAppearance editor={editor} />,
            },
            {
              id: 'webcam-timing',
              label: translate('gallery.videoReview.webcamTiming'),
              icon: Clock3,
              content: (
                <div className="space-y-2">
                  <div title={translate('gallery.videoReview.webcamOffsetHint')}>
                    <ReviewNumberRow
                      label={translate('gallery.videoReview.webcamOffset')}
                      value={camera.offsetSeconds}
                      min={-86400}
                      max={86400}
                      step={0.01}
                      precision={3}
                      unit="s"
                      onChange={(offsetSeconds) =>
                        editor.patch({ offsetSeconds: Math.round(offsetSeconds * 1000) / 1000 })
                      }
                    />
                  </div>
                  <ReviewButton
                    label={translate('gallery.videoReview.webcamHideRange')}
                    className={reviewTextButtonClassName}
                    disabled={!range || !editor.canHide(range)}
                    title={
                      !range
                        ? translate('gallery.videoReview.webcamSelectRange')
                        : !editor.canHide(range)
                          ? translate('gallery.videoReview.webcamHideConflict')
                          : undefined
                    }
                    onClick={() => {
                      if (range) editor.hide(range);
                    }}
                  >
                    <Plus size={14} />
                    <span>{translate('gallery.videoReview.webcamHideRange')}</span>
                  </ReviewButton>
                </div>
              ),
            },
          ]}
        />
      )}
      <div className="border-t border-[var(--sniptale-color-border-soft)] pt-3">
        <ReviewButton
          label={translate(
            editor.selection.kind === 'webcam'
              ? 'gallery.videoReview.webcamDisable'
              : 'gallery.videoReview.removeEdit'
          )}
          onClick={editor.remove}
          className={`${reviewDeleteButtonClassName} !w-full justify-start`}
        >
          <Trash2 size={15} />
          <span>
            {translate(
              editor.selection.kind === 'webcam'
                ? 'gallery.videoReview.webcamDisable'
                : 'gallery.videoReview.removeEdit'
            )}
          </span>
        </ReviewButton>
      </div>
    </div>
  );
}

function WebcamLayout({ editor }: { editor: Editor }) {
  const camera = editor.camera!;
  const placement = editor.placement!;
  const position = editor.selectedPosition;
  const index = position ? camera.positions.findIndex((item) => item.id === position.id) : -1;
  const updatePosition = (patch: Partial<NonNullable<Editor['selectedPosition']>>) => {
    if (position)
      editor.patch({
        positions: camera.positions.map((item) =>
          item.id === position.id ? { ...item, ...patch } : item
        ),
      });
  };
  return (
    <div className="space-y-2">
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.webcamPosition')}
        value={position?.id ?? 'base'}
        options={[
          { value: 'base', label: translate('gallery.videoReview.webcamBasePosition') },
          ...camera.positions.map((item, i) => ({
            value: item.id,
            label: `${i + 1} · ${item.time.toFixed(3)} s`,
          })),
        ]}
        onChange={(id) => editor.navigate(id === 'base' ? null : id)}
      />
      <ReviewButton
        label={translate('gallery.videoReview.webcamAddPosition')}
        className={reviewTextButtonClassName}
        disabled={
          editor.time < 0.001 || editor.time >= editor.duration || camera.positions.length >= 512
        }
        onClick={editor.addPosition}
      >
        <Plus size={14} />
        <span>{translate('gallery.videoReview.webcamAddPosition')}</span>
      </ReviewButton>
      <div className="review-inspector-columns">
        <div className="space-y-2">
          <SelectField
            className={reviewSelectFieldClassName}
            label={translate('gallery.videoReview.webcamPlacement')}
            value={placementPreset(placement)}
            options={[
              { value: 'custom', label: translate('videoEditor.sidebar.cameraLayoutCustom') },
              ...(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'full'] as const).map(
                (id) => ({
                  value: id,
                  label: translate(`gallery.videoReview.webcamPlacement_${id}`),
                })
              ),
            ]}
            onChange={(id) => {
              if (id === 'full') editor.place({ x: 0, y: 0, width: 1, height: 1 });
              else if (id !== 'custom') {
                const width =
                  placement.width === 1 && placement.height === 1 ? 0.24 : placement.width;
                const height =
                  placement.width === 1 && placement.height === 1 ? 0.24 : placement.height;
                editor.place({
                  width,
                  height,
                  x: id.endsWith('left') ? Math.min(0.03, 1 - width) : Math.max(0, 0.97 - width),
                  y: id.startsWith('top') ? Math.min(0.03, 1 - height) : Math.max(0, 0.97 - height),
                });
              }
            }}
          />
          {(['x', 'y', 'width', 'height'] as const).map((key) => (
            <ReviewNumberRow
              key={key}
              label={translate(`gallery.videoReview.webcam_${key}`)}
              value={placement[key] * 100}
              min={key === 'width' || key === 'height' ? 1 : 0}
              max={
                key === 'x'
                  ? (1 - placement.width) * 100
                  : key === 'y'
                    ? (1 - placement.height) * 100
                    : 100
              }
              step={0.1}
              precision={1}
              unit="%"
              onChange={(value) => {
                const next = { ...placement, [key]: value / 100 };
                editor.place({
                  ...next,
                  x: Math.min(next.x, 1 - next.width),
                  y: Math.min(next.y, 1 - next.height),
                });
              }}
            />
          ))}
        </div>
        {position ? (
          <div className="space-y-2">
            <ReviewNumberRow
              label={translate('gallery.videoReview.webcamPositionTime')}
              value={position.time}
              min={(camera.positions[index - 1]?.time ?? 0) + 0.001}
              max={(camera.positions[index + 1]?.time ?? editor.duration) - 0.001}
              step={0.01}
              precision={3}
              unit="s"
              onChange={(time) => updatePosition({ time })}
            />
            <SelectField
              className={reviewSelectFieldClassName}
              label={translate('gallery.videoReview.webcamTransition')}
              value={position.transition.type}
              options={[
                { value: 'none', label: translate('gallery.videoReview.webcamInstant') },
                { value: 'ease-in-out', label: translate('gallery.videoReview.webcamSmooth') },
              ]}
              onChange={(type) => {
                if (type === 'none' || type === 'ease-in-out')
                  updatePosition({ transition: { ...position.transition, type } });
              }}
            />
            {position.transition.type !== 'none' ? (
              <ReviewNumberRow
                label={translate('gallery.videoReview.webcamTransitionDuration')}
                value={position.transition.duration}
                min={0}
                max={Math.min(
                  60,
                  (camera.positions[index + 1]?.time ?? editor.duration) - position.time
                )}
                step={0.05}
                precision={2}
                unit="s"
                onChange={(duration) =>
                  updatePosition({ transition: { ...position.transition, duration } })
                }
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WebcamAppearance({ editor }: { editor: Editor }) {
  const camera = editor.camera!;
  const appearance = camera.appearance;
  return (
    <div className="review-inspector-columns">
      <div className="space-y-2">
        <SelectField
          className={reviewSelectFieldClassName}
          label={translate('videoEditor.sidebar.cameraShape')}
          value={appearance.shape}
          options={[
            { value: 'rounded', label: translate('videoEditor.sidebar.cameraShapeRounded') },
            { value: 'soft', label: translate('videoEditor.sidebar.cameraShapeSoft') },
            { value: 'ellipse', label: translate('videoEditor.sidebar.cameraShapeEllipse') },
          ]}
          onChange={(shape) => {
            if (shape === 'rounded' || shape === 'soft' || shape === 'ellipse')
              editor.patch({ appearance: { ...appearance, shape } });
          }}
        />
        {appearance.shape !== 'ellipse' ? (
          <ReviewNumberRow
            label={translate('videoEditor.sidebar.cameraRoundness')}
            value={appearance.roundness}
            min={0}
            max={100}
            step={1}
            unit="%"
            onChange={(roundness) => editor.patch({ appearance: { ...appearance, roundness } })}
          />
        ) : null}
        <SelectField
          className={reviewSelectFieldClassName}
          label={translate('gallery.videoReview.webcamMirror')}
          value={camera.mirrored ? 'yes' : 'no'}
          options={[
            { value: 'no', label: translate('gallery.videoReview.webcamMirrorOff') },
            { value: 'yes', label: translate('gallery.videoReview.webcamMirrorOn') },
          ]}
          onChange={(value) => editor.patch({ mirrored: value === 'yes' })}
        />
      </div>
      <div className="space-y-2">
        <ReviewNumberRow
          label={translate('videoEditor.sidebar.cameraCropZoom')}
          value={appearance.zoom}
          min={1}
          max={4}
          step={0.05}
          precision={2}
          onChange={(zoom) => editor.patch({ appearance: { ...appearance, zoom } })}
        />
        {(['panX', 'panY'] as const).map((key) => (
          <ReviewNumberRow
            key={key}
            label={translate(
              key === 'panX' ? 'gallery.videoReview.webcamCropX' : 'gallery.videoReview.webcamCropY'
            )}
            value={appearance[key] * 100}
            min={-100}
            max={100}
            step={1}
            unit="%"
            onChange={(value) =>
              editor.patch({ appearance: { ...appearance, [key]: value / 100 } })
            }
          />
        ))}
      </div>
    </div>
  );
}
