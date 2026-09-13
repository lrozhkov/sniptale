import { useEffect, useRef, useState } from 'react';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  applyTourCommands,
  getTourImages,
  type TourGenerationProposal,
} from '../../../features/scenario/project/public';
import { prepareTourFromGuide } from '../../../workflows/scenario-capture-edit/tour-materials';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { Translate } from '../../../platform/i18n';

/** Reviews one source-bound generation result before adding it to the shared project history. */
export function TourGeneration({
  project,
  disabled = false,
  onChange,
  onClose,
  t,
}: {
  project: GuideProject;
  disabled?: boolean;
  onChange: (next: GuideProject) => void;
  onClose: () => void;
  t: Translate;
}) {
  const { result, failed, progress, stale, accept, retry } = useTourGenerationSession(
    project,
    onChange,
    onClose,
    disabled
  );
  return (
    <section className="tour-generation" aria-busy={!result && !failed}>
      <h2>{t('scenario.editor.tourGenerationReview')}</h2>
      <p>{t('scenario.editor.tourGenerationHint')}</p>
      {!result && !failed && (
        <p role="status">
          {t('scenario.editor.tourGenerating')} {progress.completed}/{progress.total}
        </p>
      )}
      {result && (
        <>
          <p>
            {t('scenario.editor.tourSlides')}: {result.proposal.tour.slides.length}
          </p>
          <TourGenerationFindings proposal={result.proposal} t={t} />
        </>
      )}
      {stale && <p role="alert">{t('scenario.editor.tourGenerationStale')}</p>}
      {failed && <p role="alert">{t('scenario.editor.guideOperationFailed')}</p>}
      <div className="tour-generation-actions">
        <ProductActionButton compact tone="secondary" onClick={onClose}>
          {t('common.actions.cancel')}
        </ProductActionButton>
        {(failed || stale) && (
          <ProductActionButton compact tone="secondary" onClick={retry}>
            {t('common.actions.retry')}
          </ProductActionButton>
        )}
        {result && (
          <ProductActionButton
            compact
            tone="primary"
            disabled={disabled || stale || !result.proposal.tour.slides.length}
            onClick={() => accept(false)}
          >
            {t(project.tour ? 'scenario.editor.tourReplace' : 'scenario.editor.tourGenerate')}
          </ProductActionButton>
        )}
        {result && project.tour && (
          <ProductActionButton
            compact
            tone="secondary"
            disabled={
              disabled ||
              stale ||
              !result.proposal.tour.slides.length ||
              project.tour.slides.length + result.proposal.tour.slides.length > 300
            }
            onClick={() => accept(true)}
          >
            {t('scenario.editor.tourAppend')}
          </ProductActionButton>
        )}
      </div>
    </section>
  );
}

function contentIdentity(project: GuideProject): string {
  return JSON.stringify({ ...project, updatedAt: 0 });
}

/** Shows source-resolution issues before the user accepts a generated document. */
function TourGenerationFindings({
  proposal,
  t,
}: {
  proposal: TourGenerationProposal;
  t: Translate;
}) {
  return (
    <>
      <ol>
        {proposal.tour.slides.map((slide) => (
          <li key={slide.id}>{slide.title || t('scenario.editor.tourUntitled')}</li>
        ))}
      </ol>
      {proposal.issues.length > 0 && (
        <ul>
          {proposal.issues.map((issue, index) => (
            <li key={`${issue.sourceId}:${index}`}>
              {t(
                issue.kind === 'missing-image'
                  ? 'scenario.editor.missingAsset'
                  : issue.kind === 'place-hotspot'
                    ? 'scenario.editor.tourPlaceHotspot'
                    : issue.kind === 'text-only'
                      ? 'scenario.editor.tourGenerationHint'
                      : 'scenario.editor.tourTextOverflow'
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** One source-bound preparation session owns cancellation, staleness and canonical acceptance. */
function useTourGenerationSession(
  project: GuideProject,
  onChange: (next: GuideProject) => void,
  onClose: () => void,
  disabled: boolean
) {
  const latest = useRef({ project, onChange, onClose, disabled });
  latest.current = { project, onChange, onClose, disabled };
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ source: string; proposal: TourGenerationProposal } | null>(
    null
  );
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  useEffect(() => {
    const controller = new AbortController();
    const base = latest.current.project;
    setResult(null);
    setFailed(false);
    void prepareTourFromGuide({
      project: base,
      textOnly: 'navigation',
      signal: controller.signal,
      onProgress: (completed, total) => setProgress({ completed, total }),
    })
      .then((proposal) => {
        if (!controller.signal.aborted) setResult({ source: contentIdentity(base), proposal });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [attempt]);
  const stale = result !== null && result.source !== contentIdentity(project);
  const accept = (append: boolean) => {
    const current = latest.current.project;
    if (latest.current.disabled || !result || result.source !== contentIdentity(current)) return;
    const generated = result.proposal.tour;
    const tour =
      append && current.tour
        ? { ...current.tour, slides: [...current.tour.slides, ...generated.slides] }
        : generated;
    try {
      const next = applyTourCommands(current, [{ kind: 'replace-tour', tour }], {
        images: [...getTourImages(generated), ...(current.tour ? getTourImages(current.tour) : [])],
        audio:
          current.tour?.slides.flatMap((slide) =>
            slide.narration
              ? [{ assetId: slide.narration.assetId, duration: slide.narration.duration }]
              : []
          ) ?? [],
      });
      latest.current.onChange(next);
      latest.current.onClose();
    } catch {
      setFailed(true);
    }
  };
  return { result, failed, progress, stale, accept, retry: () => setAttempt((value) => value + 1) };
}
