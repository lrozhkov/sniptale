import { useEffect, useState } from 'react';
import { translate } from '../../../../platform/i18n';

function useScenarioStepPreviewReloadToken(previewDataUrl: string) {
  const [hasPreviewError, setHasPreviewError] = useState(false);
  const [previewReloadToken, setPreviewReloadToken] = useState(0);

  useEffect(() => {
    setHasPreviewError(false);
    setPreviewReloadToken((current) => current + 1);
  }, [previewDataUrl]);

  useEffect(() => {
    const reloadPreview = () => {
      setHasPreviewError(false);
      setPreviewReloadToken((current) => current + 1);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        reloadPreview();
      }
    };

    window.addEventListener('pageshow', reloadPreview);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pageshow', reloadPreview);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return {
    hasPreviewError,
    previewReloadToken,
    setHasPreviewError,
  };
}

function ScenarioStepPreviewFallback() {
  return (
    <div
      className="flex h-full w-full items-center justify-center
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_88%,transparent)]
        text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--sniptale-color-text-muted)]"
    >
      {translate('scenario.content.step')}
    </div>
  );
}

function ScenarioStepPreviewImage(props: {
  onPreviewError: () => void;
  previewDataUrl: string;
  previewReloadToken: number;
}) {
  return (
    <img
      key={`${props.previewDataUrl}:${props.previewReloadToken}`}
      src={props.previewDataUrl}
      alt=""
      loading="eager"
      decoding="async"
      onError={props.onPreviewError}
      className="block h-full w-full object-contain"
    />
  );
}

export function ScenarioRecorderStepPreview(props: { className?: string; previewDataUrl: string }) {
  const previewState = useScenarioStepPreviewReloadToken(props.previewDataUrl);
  const previewClassName = props.className ?? 'h-[72px]';

  return (
    <div
      data-ui="content.scenario.sidebar.step-preview"
      className={[
        previewClassName,
        'overflow-hidden rounded-[12px] border border-[var(--sniptale-color-border-soft)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_88%,transparent)]',
      ].join(' ')}
    >
      {previewState.hasPreviewError ? (
        <ScenarioStepPreviewFallback />
      ) : (
        <ScenarioStepPreviewImage
          previewDataUrl={props.previewDataUrl}
          previewReloadToken={previewState.previewReloadToken}
          onPreviewError={() => previewState.setHasPreviewError(true)}
        />
      )}
    </div>
  );
}
