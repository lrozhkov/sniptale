import { Check, ChevronRight, Volume2 } from 'lucide-react';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import type { VideoProjectTextVoiceController } from '../../../../runtime/session/text-voice';
import { formatNumber, translate, useAppLocale } from '../../../../../platform/i18n';

type Item = VideoProjectTextVoiceController['items'][number];
type Consent = VideoProjectTextVoiceController['consent'];

/** Disclosure reads the frozen request or accepted snapshot before current editable text. */
export function projectVoiceItemText(project: VideoProject, item: Item, consent: Consent) {
  return (
    item.preview?.textSnapshot.text.text ??
    consent?.queue.items.find(
      (entry) => entry.documentId === item.documentId && entry.fragmentId === item.fragmentId
    )?.capture.basis.fragment.text ??
    project.textDocuments
      ?.find((entry) => entry.id === item.documentId)
      ?.document.fragments.find((entry) => entry.id === item.fragmentId)?.text ??
    ''
  );
}

/** Batch selection is separate from the active take's audition and placement editor. */
export function ProjectTextVoiceBatch({
  project,
  operation: op,
}: {
  project: VideoProject;
  operation: Pick<
    VideoProjectTextVoiceController,
    'items' | 'target' | 'consent' | 'running' | 'pendingApply' | 'focusItem' | 'toggleItem'
  >;
}) {
  const locale = useAppLocale();
  const items = op.consent
    ? op.items.filter((item) =>
        op.consent?.queue.items.some(
          (entry) => entry.documentId === item.documentId && entry.fragmentId === item.fragmentId
        )
      )
    : op.items;
  return (
    <div className="min-w-0 space-y-2" data-ui="video-editor.text-voice.batch">
      <div className="flex flex-wrap gap-2 text-xs text-[var(--sniptale-color-text-secondary)]">
        <span>
          {translate('gallery.videoReview.speechBatchSelected').replace(
            '{count}',
            String(items.filter((item) => item.selected && !item.accepted).length)
          )}
        </span>
        <span>
          {translate('gallery.videoReview.speechBatchReady').replace(
            '{count}',
            String(items.filter((item) => item.selected && item.preview && !item.accepted).length)
          )}
        </span>
      </div>
      {items.map((item) => {
        const text = projectVoiceItemText(project, item, op.consent);
        const active =
          item.documentId === op.target?.documentId && item.fragmentId === op.target.fragmentId;
        return (
          <div
            key={JSON.stringify([item.documentId, item.fragmentId])}
            data-project-voice-take={item.fragmentId}
            className="flex min-h-14 min-w-0 items-start gap-2 border-t border-[var(--sniptale-color-border-soft)] pt-2"
          >
            <label className="flex h-8 shrink-0 items-center justify-center">
              <input
                type="checkbox"
                className="sniptale-parameter-check"
                aria-label={text || translate('gallery.videoReview.speechSelectPhrase')}
                checked={item.selected}
                disabled={op.running || op.pendingApply || !!op.consent || item.accepted}
                onChange={() => op.toggleItem(item.documentId, item.fragmentId)}
              />
            </label>
            <button
              type="button"
              aria-pressed={active}
              className="flex min-h-8 min-w-0 flex-1 items-start gap-2 text-left text-xs"
              title={text}
              onClick={() => op.focusItem(item.documentId, item.fragmentId)}
            >
              <span className="min-w-0 flex-1">
                <span
                  data-project-voice-text
                  className={`block break-words ${op.consent ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}
                  style={{ fontFamily: 'var(--sniptale-font-document-sans)' }}
                >
                  {text || translate('gallery.videoReview.textFragment')}
                </span>
                {item.preview ? (
                  <span className="block text-[var(--sniptale-color-text-secondary)] tabular-nums">
                    {translate('gallery.videoReview.textVoiceDuration').replace(
                      '{duration}',
                      formatNumber(item.preview.duration, { maximumFractionDigits: 2 }, locale)
                    )}
                  </span>
                ) : null}
                {item.accepted ? (
                  <span className="sr-only">{translate('videoEditor.sidebar.textVoiceSaved')}</span>
                ) : null}
              </span>
              {item.accepted ? (
                <Check size={14} aria-hidden="true" className="mt-1 shrink-0" />
              ) : item.preview ? (
                <Volume2 size={14} aria-hidden="true" className="mt-1 shrink-0" />
              ) : (
                <ChevronRight size={14} aria-hidden="true" className="mt-1 shrink-0" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
