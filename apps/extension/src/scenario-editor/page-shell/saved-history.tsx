import { useEffect, useState } from 'react';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { getScenarioSavedVersions } from '../../composition/persistence/scenario/history';
import { SCENARIO_HISTORY_LIMIT } from '../../composition/persistence/scenario/history-model';
import { useAppLocale, type Translate } from '../../platform/i18n';
import { useGuideImages } from './runtime/use-state';

type SavedVersions = Awaited<ReturnType<typeof getScenarioSavedVersions>>;
type HistoryProps = {
  project: GuideProject;
  disabled: boolean;
  onRestore: (revision: number) => Promise<boolean>;
  onClearHistory: () => Promise<boolean>;
  canClearHistory: boolean;
  t: Translate;
};

/** Collapsible committed-history browser; its preview never replaces the page edit buffer. */
export function GuideSavedHistory(props: HistoryProps) {
  const [open, setOpen] = useState(false);
  return (
    <section className="guide-saved-history">
      <button
        type="button"
        aria-expanded={open}
        disabled={props.disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {props.t('scenario.editor.guideSavedHistory')}
      </button>
      {open && <GuideSavedHistoryPanel {...props} />}
    </section>
  );
}

function GuideSavedHistoryPanel({
  project,
  disabled,
  onRestore,
  onClearHistory,
  canClearHistory,
  t,
}: HistoryProps) {
  const [data, setData] = useState<SavedVersions | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<'restore' | 'clear' | null>(null);
  const [restoreFailed, setRestoreFailed] = useState<'restore' | 'clear' | null>(null);
  const locale = useAppLocale();
  useEffect(() => {
    let active = true;
    setFailed(false);
    void getScenarioSavedVersions(project.id)
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [project.id, project.updatedAt, attempt]);
  const selected =
    data?.versions.find((version) => version.revision === selectedRevision) ?? data?.versions[0];
  const formatTime = (time: number) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' }).format(time);
  const restore = async () => {
    if (!selected || disabled) return;
    const accepted =
      confirmation === 'clear' ? await onClearHistory() : await onRestore(selected.revision);
    setRestoreFailed(accepted ? null : confirmation);
    setConfirmation(null);
  };
  return (
    <div>
      <p>
        {t('scenario.editor.guideHistoryLimit').replace('{count}', String(SCENARIO_HISTORY_LIMIT))}
      </p>
      {!data && !failed && <p role="status">{t('scenario.editor.loading')}</p>}
      {failed && (
        <p role="alert">
          {t('scenario.editor.guideHistoryLoadFailed')}{' '}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t('scenario.editor.guideRetry')}
          </button>
        </p>
      )}
      {data && selected && (
        <>
          <label>
            {t('scenario.editor.guideSavedVersion')}
            <select
              aria-label={t('scenario.editor.guideSavedVersion')}
              disabled={disabled}
              value={selected.revision}
              onChange={(event) => {
                setSelectedRevision(Number(event.target.value));
                setRestoreFailed(null);
              }}
            >
              {data.versions.map((version) => (
                <option key={version.revision} value={version.revision}>
                  {t('scenario.editor.guideVersionLabel').replace(
                    '{revision}',
                    String(version.revision)
                  )}{' '}
                  · {formatTime(version.savedAt)}
                  {version.revision === data.currentRevision
                    ? ` · ${t('scenario.editor.guideCurrentVersion')}`
                    : ''}
                </option>
              ))}
            </select>
          </label>
          <GuideSavedHistoryPreview project={selected.project} t={t} />
          <button
            type="button"
            disabled={disabled || failed || selected.revision === data.currentRevision}
            onClick={() => setConfirmation('restore')}
          >
            {t('scenario.editor.guideRestoreVersion')}
          </button>
          <button
            type="button"
            disabled={disabled || failed || !canClearHistory || data.versions.length < 2}
            onClick={() => setConfirmation('clear')}
          >
            {t('scenario.editor.guideClearHistory')}
          </button>
          {!canClearHistory && <p>{t('scenario.editor.guideHistorySaveFirst')}</p>}
        </>
      )}
      {restoreFailed && (
        <p role="alert">
          {t(
            restoreFailed === 'clear'
              ? 'scenario.editor.guideHistoryClearFailed'
              : 'scenario.editor.guideHistoryRestoreFailed'
          )}
        </p>
      )}
      <ProductConfirmDialog
        isOpen={confirmation !== null}
        isLoading={disabled}
        title={t(
          confirmation === 'clear'
            ? 'scenario.editor.guideClearHistory'
            : 'scenario.editor.guideRestoreVersion'
        )}
        message={t(
          confirmation === 'clear'
            ? 'scenario.editor.guideClearHistoryMessage'
            : 'scenario.editor.guideRestoreVersionMessage'
        )}
        confirmText={t(
          confirmation === 'clear'
            ? 'scenario.editor.guideClearHistory'
            : 'scenario.editor.guideRestoreVersion'
        )}
        cancelText={t('common.actions.cancel')}
        onCancel={() => setConfirmation(null)}
        onConfirm={restore}
      />
    </div>
  );
}

/** Read-only saved content, with the same normalized image geometry as the edit buffer. */
function GuideSavedHistoryPreview({ project, t }: { project: GuideProject; t: Translate }) {
  const images = useGuideImages(project);
  let number = 0;
  return (
    <div
      className="guide-history-preview"
      tabIndex={0}
      aria-label={t('scenario.editor.guideVersionPreview')}
    >
      <h3>{project.name}</h3>
      {project.items.map((item) => {
        if (item.kind === 'section')
          return (
            <section key={item.id}>
              <h4>{item.title}</h4>
              {item.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph.runs.map((run) => run.text).join('')}</p>
              ))}
            </section>
          );
        number += 1;
        return (
          <section key={item.id}>
            <h4>
              {item.showNumber ? `${number}. ` : ''}
              {item.title}
            </h4>
            {item.blocks.map((block) => {
              if (block.kind === 'heading') return <h5 key={block.id}>{block.text}</h5>;
              if (block.kind !== 'image')
                return (
                  <div key={block.id}>
                    {block.paragraphs.map((paragraph, index) => (
                      <p key={index}>{paragraph.runs.map((run) => run.text).join('')}</p>
                    ))}
                  </div>
                );
              return (
                <figure key={block.id}>
                  <div
                    className="guide-history-image"
                    style={{
                      width: `min(100%, ${block.frame.width}px)`,
                      aspectRatio: `${block.frame.width} / ${block.frame.height}`,
                    }}
                  >
                    {images[block.assetId] ? (
                      <img
                        src={images[block.assetId] ?? undefined}
                        alt={block.alt}
                        style={{
                          objectFit: block.fit,
                          transform: [
                            `translate(${block.contentTransform.x * 100}%,`,
                            `${block.contentTransform.y * 100}%)`,
                            `scale(${block.contentTransform.scale})`,
                          ].join(' '),
                        }}
                      />
                    ) : (
                      <span>
                        {t(
                          images[block.assetId] === null
                            ? 'scenario.editor.workspacePreviewLoadError'
                            : 'scenario.editor.loading'
                        )}
                      </span>
                    )}
                  </div>
                  {block.caption && <figcaption>{block.caption}</figcaption>}
                </figure>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
