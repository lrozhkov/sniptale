import { useEffect, useRef, useState } from 'react';
import { translate } from '../../../platform/i18n';
import { getScenarioAssetBlob } from '../../../composition/persistence/scenario/store/public';
import type { ScenarioPreviewStep } from '../../../features/scenario/contracts/types/project';

export function ScenarioPreviewStepCard({ step }: { step: ScenarioPreviewStep }) {
  return (
    <article
      className="overflow-hidden rounded-[18px] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-panel)] shadow-sm"
    >
      {(step.title || step.numberLabel !== null) && (
        <header className="px-4 py-3">
          {step.title && <h3 className="break-words text-sm font-semibold">{step.title}</h3>}
          {step.numberLabel !== null && (
            <div className="mt-2 break-words text-xs text-[var(--sniptale-color-text-muted)]">
              {translate('gallery.app.scenarioStepLabel')} {step.numberLabel}
            </div>
          )}
        </header>
      )}
      {step.images.map((image) => (
        <ScenarioPreviewImage key={`${image.id}:${image.assetId}`} image={image} />
      ))}
    </article>
  );
}

/** Owns viewport-triggered local bytes and their disposable object URL. */
function ScenarioPreviewImage({ image }: { image: ScenarioPreviewStep['images'][number] }) {
  const frame = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let started = false;
    let objectUrl: string | null = null;
    const load = () => {
      if (started || !active) return;
      started = true;
      void getScenarioAssetBlob(image.assetId)
        .then((blob) => {
          if (!active) return;
          if (!blob) {
            setFailed(true);
            return;
          }
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    };
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        load();
      }
    });
    if (frame.current) observer.observe(frame.current);
    return () => {
      active = false;
      observer.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.assetId]);
  return (
    <figure className="m-0">
      <div
        ref={frame}
        className="relative overflow-hidden"
        style={{ aspectRatio: `${image.frame.width} / ${image.frame.height}` }}
      >
        {url && !failed ? (
          <img
            src={url}
            alt={image.alt}
            onError={() => setFailed(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: image.fit,
              translate: `${image.contentTransform.x * 100}% ${image.contentTransform.y * 100}%`,
              scale: image.contentTransform.scale,
            }}
          />
        ) : (
          <p role="status" className="p-3 text-sm text-[var(--sniptale-color-text-muted)]">
            {translate(failed ? 'gallery.preview.unavailableGuide' : 'gallery.app.loading')}
          </p>
        )}
      </div>
      {image.caption && (
        <figcaption className="break-words px-4 py-2 text-sm">{image.caption}</figcaption>
      )}
    </figure>
  );
}
