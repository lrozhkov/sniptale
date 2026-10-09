import { Check, ChevronDown, Headphones, Minus } from 'lucide-react';
import { useState } from 'react';
import { sameReviewSpeechTarget } from '../../contracts/ai/audio';
import { reviewSpeechTextSignature } from '../../features/video/review/speech-transcript';
import { reviewSpeechQueueKey } from '../../workflows/video-review/speech-queue';
import { translate } from '../../platform/i18n';
import { ReviewButton, reviewTextButtonClassName } from './controls';
import { SpeechAudition, formatSpeechTime } from './speech-audition';
import type { useReviewSpeech } from './use-speech';

type Controller = ReturnType<typeof useReviewSpeech>;
export interface SpeechBatchWorkspaceProps {
  speech: Pick<
    Controller,
    | 'target'
    | 'groups'
    | 'allPreviews'
    | 'profile'
    | 'catalogs'
    | 'running'
    | 'saving'
    | 'dirty'
    | 'generateQueue'
    | 'apply'
  >;
  selected: readonly string[];
  onSelect(keys: string[]): void;
  mainVideo?: HTMLVideoElement | undefined;
  assetNames?: ReadonlyMap<string, { filename: string }> | undefined;
}

/** Explicit project-local batch selection is independent of the current text editor and disclosure state. */
export function SpeechBatchWorkspace(props: SpeechBatchWorkspaceProps) {
  const { speech } = props;
  const groups = speech.groups.filter((group) => group.transcript.phrases.length);
  const [closed, setClosed] = useState<string[]>([]);
  const [audition, setAudition] = useState<string>();
  const busy = speech.running || speech.saving || speech.dirty;
  const entries = groups.flatMap((group) =>
    group.transcript.phrases.map((phrase) => ({
      target: group.target,
      phraseId: phrase.id,
    }))
  );
  const selected = entries.filter((entry) => props.selected.includes(reviewSpeechQueueKey(entry)));
  const selectedKeys = selected.map(reviewSpeechQueueKey);
  const ready = speech.allPreviews.filter((preview) =>
    selectedKeys.includes(
      reviewSpeechQueueKey({
        target: preview.scope.target,
        phraseId: preview.replacement.phraseId,
      })
    )
  );
  const available =
    !!speech.profile &&
    !!speech.catalogs?.speech.models.some((model) => model.id === speech.profile?.modelId);
  const overflow = ready.some(
    (preview) =>
      preview.replacement.duration > preview.replacement.end - preview.replacement.start + 1e-7
  );
  const toggle = (keys: string[]) => {
    const remove = keys.every((key) => selectedKeys.includes(key));
    props.onSelect(
      remove
        ? selectedKeys.filter((key) => !keys.includes(key))
        : [...new Set([...selectedKeys, ...keys])]
    );
  };
  const changed = selected.filter((entry) => {
    const transcript = groups.find((group) =>
      sameReviewSpeechTarget(group.target, entry.target)
    )?.transcript;
    const phrase = transcript?.phrases.find((value) => value.id === entry.phraseId);
    return (
      phrase &&
      speech.profile &&
      !transcript?.replacements.some(
        (replacement) =>
          replacement.phraseId === phrase.id &&
          replacement.revision === phrase.revision &&
          replacement.textSignature === reviewSpeechTextSignature(phrase.text, speech.profile!)
      )
    );
  });
  return (
    <div className="min-w-0 space-y-3" data-ui="gallery.videoReview.speechBatch">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--sniptale-color-text-muted)]">
        <BatchCheckbox
          checked={selected.length === entries.length && !!entries.length}
          partial={!!selected.length && selected.length < entries.length}
          disabled={busy}
          label={translate('gallery.videoReview.speechSelectAll')}
          onChange={() => toggle(entries.map(reviewSpeechQueueKey))}
        />
        <span>
          {translate('gallery.videoReview.speechBatchSelected').replace(
            '{count}',
            String(selected.length)
          )}
        </span>
        {!!ready.length && (
          <span>
            {translate('gallery.videoReview.speechBatchReady').replace(
              '{count}',
              String(ready.length)
            )}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        <ReviewButton
          label={translate('gallery.videoReview.speechGenerateSelected')}
          className={reviewTextButtonClassName}
          disabled={busy || !available || !selected.length}
          onClick={() => speech.generateQueue(selected)}
        />
        <ReviewButton
          label={translate('gallery.videoReview.speechGenerateChanged')}
          className={reviewTextButtonClassName}
          disabled={busy || !available || !changed.length}
          onClick={() => speech.generateQueue(changed)}
        />
        <ReviewButton
          label={translate('gallery.videoReview.speechApplySelected')}
          className={reviewTextButtonClassName}
          disabled={busy || overflow || !ready.length}
          onClick={() => speech.apply(ready)}
        />
      </div>
      {speech.profile && (
        <p className="truncate text-xs text-[var(--sniptale-color-text-muted)]">
          {speech.catalogs?.speech.models.find((model) => model.id === speech.profile?.modelId)
            ?.displayName ?? speech.profile.modelId}
          {' · '}
          {speech.profile.voiceId}
        </p>
      )}
      {groups.map((group, index) => (
        <SpeechBatchGroup
          key={JSON.stringify(group.target)}
          group={group}
          index={index}
          props={props}
          selectedKeys={selectedKeys}
          toggle={toggle}
          busy={busy}
          expanded={!closed.includes(JSON.stringify(group.target))}
          onToggle={() => {
            const key = JSON.stringify(group.target);
            setClosed((current) =>
              current.includes(key) ? current.filter((value) => value !== key) : [...current, key]
            );
          }}
          audition={audition}
          onAudition={setAudition}
        />
      ))}
    </div>
  );
}

/** A clip group presents its own disclosure and previews without owning batch publication. */
function SpeechBatchGroup({
  group,
  index,
  props,
  selectedKeys,
  toggle,
  busy,
  expanded,
  onToggle,
  audition,
  onAudition,
}: {
  group: Controller['groups'][number];
  index: number;
  props: SpeechBatchWorkspaceProps;
  selectedKeys: string[];
  toggle(keys: string[]): void;
  busy: boolean;
  expanded: boolean;
  onToggle(): void;
  audition: string | undefined;
  onAudition(key: string | undefined): void;
}) {
  const speech = props.speech;
  const key = JSON.stringify(group.target);
  const keys = group.transcript.phrases.map((phrase) =>
    reviewSpeechQueueKey({ target: group.target, phraseId: phrase.id })
  );
  const count = keys.filter((value) => selectedKeys.includes(value)).length;
  const name =
    group.target.kind === 'original'
      ? translate('gallery.videoReview.audioOriginal')
      : (props.assetNames?.get(group.assetId)?.filename ??
        translate('gallery.videoReview.speechBatchClip').replace('{index}', String(index + 1)));
  return (
    <section key={key} className="min-w-0 border-t border-[var(--sniptale-color-border-soft)] pt-2">
      <div className="flex min-w-0 items-center gap-2">
        <BatchCheckbox
          checked={count === keys.length}
          partial={count > 0 && count < keys.length}
          disabled={busy}
          label={translate('gallery.videoReview.speechBatchSelectClip').replace('{name}', name)}
          onChange={() => toggle(keys)}
        />
        <button
          type="button"
          aria-expanded={expanded}
          title={name}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs"
          onClick={() => onToggle()}
        >
          <ChevronDown size={14} className={`shrink-0 ${expanded ? '' : '-rotate-90'}`} />
          <span className="min-w-0 flex-1 truncate">{name}</span>
          <span className="text-[var(--sniptale-color-text-muted)]">
            {count}/{keys.length}
          </span>
        </button>
      </div>
      {expanded && (
        <div className="mt-2 space-y-2 pl-1">
          {group.transcript.phrases.map((phrase) => {
            const phraseKey = reviewSpeechQueueKey({
              target: group.target,
              phraseId: phrase.id,
            });
            const preview = speech.allPreviews.find(
              (entry) =>
                sameReviewSpeechTarget(entry.scope.target, group.target) &&
                entry.replacement.phraseId === phrase.id
            );
            return (
              <div key={phrase.id} className="min-w-0 space-y-2" data-speech-batch-key={phraseKey}>
                <div className="flex min-w-0 items-center gap-2 text-xs">
                  <BatchCheckbox
                    checked={selectedKeys.includes(phraseKey)}
                    disabled={busy}
                    label={phrase.text}
                    onChange={() => toggle([phraseKey])}
                  />
                  <span className="min-w-0 flex-1 truncate" title={phrase.text}>
                    {phrase.text}
                  </span>
                  <span className="shrink-0 tabular-nums text-[var(--sniptale-color-text-muted)]">
                    {formatSpeechTime(phrase.start)}–{formatSpeechTime(phrase.end)}
                  </span>
                  {preview && (
                    <ReviewButton
                      label={translate('gallery.videoReview.speechPreview')}
                      className={`${reviewTextButtonClassName} !w-7 !px-0`}
                      onClick={() => onAudition(audition === phraseKey ? undefined : phraseKey)}
                    >
                      <Headphones size={14} />
                    </ReviewButton>
                  )}
                </div>
                {preview && audition === phraseKey && (
                  <SpeechAudition
                    originalUrl={null}
                    result={{ url: preview.url, duration: preview.replacement.duration }}
                    interval={{ start: phrase.start, end: phrase.end }}
                    tempo={1}
                    mainVideo={props.mainVideo}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function BatchCheckbox(props: {
  checked: boolean;
  partial?: boolean;
  disabled: boolean;
  label: string;
  onChange(): void;
}) {
  return (
    <label className="review-history-checkbox" title={props.label}>
      <input
        type="checkbox"
        aria-label={props.label}
        checked={props.checked}
        disabled={props.disabled}
        ref={(node) => {
          if (node) node.indeterminate = props.partial ?? false;
        }}
        onChange={props.onChange}
      />
      <span aria-hidden="true">
        {props.partial ? <Minus size={12} /> : props.checked ? <Check size={12} /> : null}
      </span>
    </label>
  );
}
