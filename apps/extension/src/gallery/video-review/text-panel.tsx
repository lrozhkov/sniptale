import { useEffect, useRef, useState } from 'react';
import { Plus, SlidersHorizontal, Trash2, Volume2 } from 'lucide-react';
import { ReviewTextVoiceForm } from './text-voice-panel';
import { useReviewTextVoiceMode } from './text-voice-focus';
import type { ReviewTextVoiceAccess } from './use-text-voice';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { SelectField } from '../../ui/compact-inspector-controls';
import { HistorySearch } from './action-history-filters';
import { queryReviewText, type ReviewTextFilters, type useReviewText } from './use-review-text';
import type { ReviewVoiceTextSnapshot } from '../../features/video/review/text-document';
import { ReviewTextPhrase } from './speech-phrase';
import {
  ReviewButton,
  reviewDeleteButtonClassName,
  reviewSelectFieldClassName,
  reviewTextButtonClassName,
} from './controls';
import { translate } from '../../platform/i18n';

const buttonClass = `${reviewTextButtonClassName} !h-auto min-h-8! whitespace-normal text-left`;

const emptyTextFilters: ReviewTextFilters = {
  query: '',
  origin: 'all',
  voice: 'all',
  visibility: 'all',
};
const textOrigins = [
  { value: 'all', messageKey: 'gallery.videoReview.textFragmentAll' },
  { value: 'manual', messageKey: 'gallery.videoReview.textFragmentManual' },
  { value: 'original', messageKey: 'gallery.videoReview.textFragmentOriginal' },
  { value: 'voiceover', messageKey: 'gallery.videoReview.textFragmentVoiceover' },
] as const;
const textVoices = [
  { value: 'all', messageKey: 'gallery.videoReview.textFragmentAll' },
  { value: 'none', messageKey: 'gallery.videoReview.textFragmentVoiceNone' },
  { value: 'current', messageKey: 'gallery.videoReview.textFragmentVoiceCurrent' },
  { value: 'changed', messageKey: 'gallery.videoReview.textFragmentVoiceChanged' },
] as const;
const textVisibility = [
  { value: 'all', messageKey: 'gallery.videoReview.textFragmentAll' },
  { value: 'shown', messageKey: 'gallery.videoReview.textFragmentShown' },
  { value: 'hidden', messageKey: 'gallery.videoReview.textFragmentHidden' },
] as const;

/** The one track document reuses phrase cards and the history search/filter pattern. */
type TextDocumentPanelProps = {
  editor: ReturnType<typeof useReviewText>;
  snapshots: readonly ReviewVoiceTextSnapshot[];
  busy: boolean;
  voice?: ReviewTextVoiceAccess | undefined;
};

export function ReviewTextDocumentPanel(props: TextDocumentPanelProps) {
  const voiceMode = useReviewTextVoiceMode<HTMLElement>();
  const list = useReviewTextDocumentList(props);
  const {
    filters,
    setFilters,
    showFilters,
    setShowFilters,
    setSelected,
    batch,
    setBatch,
    limit,
    setLimit,
    fragments,
    query,
    filtered,
  } = list;
  if (voiceMode.ids && props.voice)
    return (
      <ReviewTextVoiceForm
        access={props.voice}
        ids={voiceMode.ids}
        disabled={props.busy}
        onClose={voiceMode.close}
      />
    );
  return (
    <section
      ref={voiceMode.root}
      data-ui="gallery.videoReview.textDocument"
      className="min-w-0 space-y-2"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.textFragmentCount')
            .replace('{found}', String(query.found.length))
            .replace('{total}', String(fragments.length))}
        </span>
        <ReviewButton
          label={translate('gallery.videoReview.textFragmentAdd')}
          className={`${reviewTextButtonClassName} !w-8 !px-0`}
          disabled={props.busy || props.editor.projection.resultDuration <= 0}
          onClick={() => {
            setFilters(emptyTextFilters);
            props.editor.add(false);
          }}
        >
          <Plus size={14} />
        </ReviewButton>
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <HistorySearch
          query={filters.query}
          label={translate('gallery.videoReview.textFragmentSearch')}
          onChange={(query) => {
            setFilters((current) => ({ ...current, query }));
            setLimit(50);
          }}
        />
        <ContentToolbarButton
          tone="utility"
          size="compact"
          active={filtered}
          aria-expanded={showFilters}
          aria-label={translate('gallery.videoReview.textFragmentFilters')}
          onClick={() => setShowFilters((value) => !value)}
        >
          <SlidersHorizontal size={16} />
        </ContentToolbarButton>
      </div>
      {showFilters && <TextDocumentFilters filters={filters} onChange={setFilters} />}
      <TextDocumentBatchActions
        batch={batch}
        setBatch={setBatch}
        setSelected={setSelected}
        query={query}
        busy={props.busy}
        remove={props.editor.remove}
        onVoice={props.voice ? (ids) => voiceMode.open(ids, 'batch') : undefined}
      />
      {props.editor.error && (
        <p role="alert" className="text-xs">
          {textDocumentErrorMessage(props.editor.error)}
        </p>
      )}
      {!query.found.length && (
        <div className="space-y-1 text-xs">
          <p>{translate('gallery.videoReview.textFragmentEmpty')}</p>
          {filtered && (
            <ReviewButton
              label={translate('gallery.videoReview.textFragmentResetFilters')}
              className={buttonClass}
              onClick={() => setFilters(emptyTextFilters)}
            >
              {translate('gallery.videoReview.textFragmentResetFilters')}
            </ReviewButton>
          )}
        </div>
      )}
      {list.rendered.map((fragment) => {
        const index = fragments.findIndex((item) => item.id === fragment.id);
        return (
          <ReviewTextPhrase
            key={fragment.id}
            fragment={fragment}
            next={fragments[index + 1]}
            index={index}
            editor={props.editor}
            expanded={list.opened === fragment.id}
            selected={list.selected.includes(fragment.id)}
            batch={batch}
            focus={props.editor.createdId === fragment.id}
            busy={props.busy}
            limit={
              fragment.timeDomain === 'source'
                ? props.editor.projection.duration
                : props.editor.projection.resultDuration
            }
            onToggle={() => list.toggleOpened(fragment.id)}
            onSelect={() => list.toggleSelected(fragment.id)}
            onJump={() => props.editor.jump(fragment)}
            actions={
              props.voice && (
                <ReviewButton
                  data-text-voice-trigger={`fragment:${fragment.id}`}
                  label={translate('gallery.videoReview.speechGenerate')}
                  className={`${reviewTextButtonClassName} !w-8 !px-0`}
                  disabled={props.busy || !fragment.text.trim()}
                  onClick={() => voiceMode.open([fragment.id], `fragment:${fragment.id}`)}
                >
                  <Volume2 size={14} />
                </ReviewButton>
              )
            }
          />
        );
      })}
      {query.found.length > limit && (
        <ReviewButton
          label={translate('gallery.videoReview.textFragmentMore')}
          className={buttonClass}
          onClick={() => setLimit((current) => current + 50)}
        >
          {translate('gallery.videoReview.textFragmentMore')}
        </ReviewButton>
      )}
    </section>
  );
}

/** Validation failure copy does not own list navigation or voice admission. */
function textDocumentErrorMessage(error: ReturnType<typeof useReviewText>['error']) {
  if (!error) return null;
  return translate(
    error === 'gap'
      ? 'gallery.videoReview.textFragmentGap'
      : error === 'alignment'
        ? 'gallery.videoReview.textFragmentSplitHint'
        : 'gallery.videoReview.textFragmentInvalid'
  );
}

/** Filter controls have no selection or audio-job authority. */
function TextDocumentFilters(props: {
  filters: ReviewTextFilters;
  onChange: React.Dispatch<React.SetStateAction<ReviewTextFilters>>;
}) {
  return (
    <div className="space-y-1">
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.textFragmentOrigin')}
        value={props.filters.origin}
        options={textOrigins.map((item) => ({
          ...item,
          label: translate(item.messageKey),
        }))}
        onChange={(value) => {
          const option = textOrigins.find((item) => item.value === value);
          if (option) props.onChange((current) => ({ ...current, origin: option.value }));
        }}
      />
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.speechSynthesis')}
        value={props.filters.voice}
        options={textVoices.map((item) => ({
          ...item,
          label: translate(item.messageKey),
        }))}
        onChange={(value) => {
          const option = textVoices.find((item) => item.value === value);
          if (option) props.onChange((current) => ({ ...current, voice: option.value }));
        }}
      />
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.textFragmentVisibility')}
        value={props.filters.visibility}
        options={textVisibility.map((item) => ({
          ...item,
          label: translate(item.messageKey),
        }))}
        onChange={(value) => {
          const option = textVisibility.find((item) => item.value === value);
          if (option) props.onChange((current) => ({ ...current, visibility: option.value }));
        }}
      />
    </div>
  );
}

/** The document alone owns filtering, batch scope, the single open card and paging. */
function useReviewTextDocumentList(props: TextDocumentPanelProps) {
  const [filters, setFilters] = useState<ReviewTextFilters>(emptyTextFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [batch, setBatch] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const consumedCreation = useRef(props.editor.createdId);
  const fragments = props.editor.document.fragments;
  const query = queryReviewText(fragments, props.snapshots, filters, selected);
  const rendered = query.found.slice(0, limit);
  const openedFragment = query.found.find((fragment) => fragment.id === opened);
  if (openedFragment && !rendered.includes(openedFragment)) rendered.push(openedFragment);
  const filtered =
    filters.query !== '' ||
    filters.origin !== 'all' ||
    filters.voice !== 'all' ||
    filters.visibility !== 'all';
  useEffect(() => {
    const id = props.editor.createdId;
    if (!id || id === consumedCreation.current) return;
    const index = fragments.findIndex((fragment) => fragment.id === id);
    if (index < 0) return;
    consumedCreation.current = id;
    setOpened(id);
  }, [props.editor.createdId, fragments]);
  useEffect(() => {
    const ids = new Set(fragments.map((fragment) => fragment.id));
    setSelected((current) => {
      const kept = current.filter((id) => ids.has(id));
      return kept.length === current.length ? current : kept;
    });
  }, [fragments]);
  return {
    filters,
    setFilters,
    showFilters,
    setShowFilters,
    selected,
    setSelected,
    batch,
    setBatch,
    opened,
    toggleOpened: (id: string) => setOpened((current) => (current === id ? null : id)),
    toggleSelected: (id: string) =>
      setSelected((current) =>
        current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
      ),
    limit,
    setLimit,
    fragments,
    query,
    rendered,
    filtered,
  };
}

/** Bulk actions act on the filtered selection; hidden selected IDs remain outside this scope. */
function TextDocumentBatchActions(props: {
  batch: boolean;
  setBatch: React.Dispatch<React.SetStateAction<boolean>>;
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  query: ReturnType<typeof queryReviewText>;
  busy: boolean;
  remove(ids: readonly string[]): void;
  onVoice?: ((ids: readonly string[]) => void) | undefined;
}) {
  return (
    <>
      {' '}
      <div className="flex flex-wrap gap-1">
        <ReviewButton
          label={translate('gallery.videoReview.speechBatch')}
          className={buttonClass}
          aria-pressed={props.batch}
          onClick={() => props.setBatch((value) => !value)}
        >
          {translate('gallery.videoReview.speechBatch')}
        </ReviewButton>
        {props.batch && (
          <>
            <ReviewButton
              label={translate('gallery.videoReview.textFragmentSelectFound')}
              className={buttonClass}
              onClick={() =>
                props.setSelected((current) => [
                  ...new Set([...current, ...props.query.found.map((fragment) => fragment.id)]),
                ])
              }
            >
              {translate('gallery.videoReview.textFragmentSelectFound')}
            </ReviewButton>
            <ReviewButton
              label={translate('gallery.videoReview.speechDeselectAll')}
              className={buttonClass}
              onClick={() => props.setSelected([])}
            >
              {translate('gallery.videoReview.speechDeselectAll')}
            </ReviewButton>
            <ReviewButton
              label={translate('gallery.videoReview.textFragmentDelete')}
              className={`${reviewDeleteButtonClassName} !w-8 !px-0`}
              disabled={props.busy || !props.query.eligible.length}
              onClick={() => props.remove(props.query.eligible)}
            >
              <Trash2 size={14} />
            </ReviewButton>
            {props.onVoice && (
              <ReviewButton
                data-text-voice-trigger="batch"
                label={translate('gallery.videoReview.speechGenerateSelected')}
                className={buttonClass}
                disabled={props.busy || !props.query.eligible.length}
                onClick={() => props.onVoice?.(props.query.eligible)}
              >
                {translate('gallery.videoReview.speechGenerateSelected')}
              </ReviewButton>
            )}
          </>
        )}
      </div>
      {props.batch && (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.textFragmentBatchScope')
            .replace('{selected}', String(props.query.eligible.length))
            .replace('{hidden}', String(props.query.hidden))}
        </p>
      )}
    </>
  );
}
