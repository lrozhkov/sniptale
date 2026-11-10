import { useEffect, useState } from 'react';
import { translate } from '../../platform/i18n';
import { formatBytes } from '../../platform/i18n/format-bytes';
import type { ReviewSource } from '../../features/video/review/types';
import type { QuickEditWebcam } from '../../features/video/review/advanced/webcam';
import type { ReviewMediaIndex } from '../../workflows/video-review/media-index';
import { readReviewWebcamInformation } from '../../workflows/video-review/webcam-source';
import { ReviewProjectTitle } from './project-controls';
import { reviewTimeLabel } from './controls';
import type { LoadedReview } from './use-session';

/** Project information reuses the session rename command and reads camera metadata on demand. */
export function ReviewProjectInfo(props: {
  resource: Pick<LoadedReview, 'file' | 'source'>;
  name: string;
  busy: boolean;
  onRename: ((name: string) => Promise<void>) | undefined;
  index: ReviewMediaIndex | null;
  camera: QuickEditWebcam | undefined;
  cameraPending: boolean;
  cameraAttempt: number;
  active: boolean;
}) {
  const [cameraSource, setCameraSource] = useState<ReviewSource | null>(null);
  const [cameraFilename, setCameraFilename] = useState<string | null>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  const assetId = props.camera?.assetId;
  useEffect(() => {
    setCameraSource(null);
    setCameraFilename(null);
    setCameraFailed(false);
    if (!props.active || !assetId || props.cameraPending) return;
    const controller = new AbortController();
    void readReviewWebcamInformation(assetId, controller.signal)
      .then(({ source, filename }) => {
        if (!controller.signal.aborted) {
          setCameraSource(source);
          setCameraFilename(filename);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setCameraFailed(true);
      });
    return () => controller.abort();
  }, [assetId, props.active, props.cameraPending, props.cameraAttempt]);
  return (
    <section className="space-y-4" data-ui="gallery.videoReview.projectInfo">
      <div className="space-y-1">
        <h3 className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.app.projectNameLabel')}
        </h3>
        {props.onRename ? (
          <ReviewProjectTitle name={props.name} busy={props.busy} onRename={props.onRename} />
        ) : (
          <p className="break-words text-sm">{props.name}</p>
        )}
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium">{translate('gallery.preview.source')}</h3>
        <dl className="space-y-1 text-[13px] leading-[18px]">
          <ProjectProperty
            label={translate('gallery.preview.filename')}
            value={props.resource.file.name}
          />
          <SourceProperties source={props.resource.source} />
          {props.index ? (
            <>
              <ProjectProperty
                label={translate('gallery.videoReview.sourceVideoCodec')}
                value={props.index.videoCodec.toUpperCase()}
              />
              <ProjectProperty
                label={translate('gallery.videoReview.sourceAudioCodec')}
                value={props.index.audioCodec?.toUpperCase() ?? '—'}
              />
            </>
          ) : null}
        </dl>
      </div>
      {assetId ? (
        <div className="space-y-2" data-ui="gallery.videoReview.projectCameraInfo">
          <h3 className="text-sm font-medium">{translate('gallery.videoReview.webcam')}</h3>
          {cameraSource ? (
            <dl className="space-y-1 text-[13px] leading-[18px]">
              {cameraFilename ? (
                <ProjectProperty
                  label={translate('gallery.preview.filename')}
                  value={cameraFilename}
                />
              ) : null}
              <SourceProperties source={cameraSource} />
            </dl>
          ) : (
            <p className="text-xs text-[var(--sniptale-color-text-muted)]">
              {translate(cameraFailed ? 'gallery.preview.sourceMissing' : 'common.states.loading')}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function SourceProperties({ source }: { source: ReviewSource }) {
  return (
    <>
      <ProjectProperty label={translate('gallery.preview.type')} value={source.mimeType} />
      <ProjectProperty label={translate('gallery.preview.size')} value={formatBytes(source.size)} />
      <ProjectProperty
        label={translate('gallery.preview.resolution')}
        value={`${source.width} × ${source.height}`}
      />
      <ProjectProperty
        label={translate('gallery.preview.duration')}
        value={reviewTimeLabel(source.duration)}
      />
    </>
  );
}

function ProjectProperty({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-h-7 grid-cols-[minmax(6.5rem,1fr)_minmax(0,2fr)] items-baseline gap-2">
      <dt className="text-[var(--sniptale-color-text-muted)]">{label}</dt>
      <dd className="min-w-0 break-words text-right tabular-nums [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}
