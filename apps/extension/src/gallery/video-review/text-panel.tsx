import { TextDocument } from '../../ui/text-document';
import { useEffect, useRef, useState } from 'react';
import {
  Download,
  Plus,
  SlidersHorizontal,
  Trash2,
  Volume2,
  WandSparkles,
  Pencil,
  Play,
  Scissors,
} from 'lucide-react';
import { ReviewTextSubtitlesForm } from './text-subtitles-panel';
import { ReviewTextVoiceForm } from './text-voice-panel';
import { ReviewTextRewriteForm } from './text-rewrite-panel';
import { useReviewTextFormMode } from './text-voice-focus';
import type { ReviewTextVoiceAccess } from './use-text-voice';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { SelectField, SegmentedRow } from '../../ui/compact-inspector-controls';
import { HistorySearch } from './action-history-filters';
import {
  reviewTextRecordingMaximum,
  queryReviewText,
  type ReviewTextFilters,
  type useReviewText,
} from './use-review-text';
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
  subtitleMainOffset?: number | null;
  onPlay?:
    | ((fragment: import('../../features/video/review/text-document').ReviewTextFragment) => void)
    | undefined;
  canCut?: ((ids: readonly string[]) => boolean) | undefined;
  onCut?: ((ids: readonly string[]) => void) | undefined;
};

export function ReviewTextDocumentPanel(props: TextDocumentPanelProps) {
  const [view, setView] = useState<'document' | 'cards'>('document');
  const voiceMode = useReviewTextFormMode<HTMLElement>();
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
  const form = reviewTextDocumentForm(props, voiceMode);
  if (form) return form;
  return (
    <section
      ref={voiceMode.root}
      data-ui="gallery.videoReview.textDocument"
      className="min-w-0 space-y-2"
      onKeyDown={(event) => event.stopPropagation()}
    >
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
          active={showFilters}
          className="review-history-filter-toggle"
          aria-description={
            filtered ? translate('gallery.videoReview.historyFiltersActive') : undefined
          }
          aria-expanded={showFilters}
          aria-label={translate('gallery.videoReview.textFragmentFilters')}
          onClick={() => setShowFilters((value) => !value)}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          {filtered ? <span className="review-history-filter-dot" aria-hidden="true" /> : null}
        </ContentToolbarButton>
        <TextDocumentCommands
          props={props}
          mode={voiceMode}
          fragments={fragments}
          onAdd={() => {
            setFilters(emptyTextFilters);
            props.editor.add(false);
          }}
        />
      </div>
      <SegmentedRow
        label={translate('gallery.videoReview.textView')}
        ariaLabel={translate('gallery.videoReview.textView')}
        value={view}
        options={[
          { value: 'document', label: translate('gallery.videoReview.textViewDocument') },
          { value: 'cards', label: translate('gallery.videoReview.textViewCards') },
        ]}
        onChange={(value: 'document' | 'cards') => {
          props.editor.endTyping();
          setView(value);
        }}
      />
      <p className="text-xs text-[var(--sniptale-color-text-muted)]">
        {translate('gallery.videoReview.textFragmentCount')
          .replace('{found}', String(query.found.length))
          .replace('{total}', String(fragments.length))}
      </p>
      {showFilters && <TextDocumentFilters filters={filters} onChange={setFilters} />}
      {view === 'cards' && (
        <TextDocumentBatchActions
          batch={batch}
          setBatch={setBatch}
          setSelected={setSelected}
          query={query}
          busy={props.busy}
          remove={props.editor.remove}
          onVoice={props.voice ? (ids) => voiceMode.open(ids, 'batch') : undefined}
          onRewrite={
            props.voice ? (ids) => voiceMode.open(ids, 'rewrite:batch', 'rewrite') : undefined
          }
          onSubtitles={(ids) => voiceMode.open(ids, 'subtitles:batch', 'subtitles')}
        />
      )}
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
      {view === 'document' && (
        <>
          <TextDocumentContext props={props} list={list} mode={voiceMode} />
          <TextDocument
            label={translate('gallery.videoReview.textViewDocument')}
            phrases={query.found.map((fragment) => ({
              id: fragment.id,
              text: fragment.text || translate('gallery.videoReview.speechText'),
            }))}
            selectedIds={list.selected}
            onSelection={setSelected}
            onActivate={(id) => {
              const fragment = fragments.find((item) => item.id === id);
              if (fragment) props.editor.jump(fragment);
            }}
          />
        </>
      )}
      {query.found.map((fragment, foundIndex) => {
        const index = fragments.findIndex((item) => item.id === fragment.id);
        return (
          <ReviewTextPhrase
            key={fragment.id}
            documentView={view === 'document'}
            visible={view === 'cards' && foundIndex < limit}
            fragment={fragment}
            next={fragments[index + 1]}
            index={index}
            editor={props.editor}
            expanded={list.opened === fragment.id}
            selected={list.selected.includes(fragment.id)}
            batch={batch}
            focus={props.editor.createdId === fragment.id || list.focus.id === fragment.id}
            focusRevision={list.focus.revision}
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
              view === 'cards' &&
              props.voice && (
                <TextPhraseVoiceActions fragment={fragment} busy={props.busy} mode={voiceMode} />
              )
            }
          />
        );
      })}
      {view === 'cards' && query.found.length > limit && (
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

/** The existing exclusive form receiver chooses one operation before the document list renders. */
function reviewTextDocumentForm(
  props: TextDocumentPanelProps,
  mode: ReturnType<typeof useReviewTextFormMode>
) {
  if (!mode.ids) return null;
  if (mode.kind === 'subtitles')
    return (
      <ReviewTextSubtitlesForm
        document={props.editor.document}
        ids={mode.ids}
        wholeDocument={mode.wholeDocument}
        mainOffset={props.subtitleMainOffset ?? null}
        disabled={props.busy}
        onClose={mode.close}
      />
    );
  if (!props.voice) return null;
  return mode.kind === 'rewrite' ? (
    <ReviewTextRewriteForm
      access={props.voice}
      ids={mode.ids}
      wholeDocument={mode.wholeDocument}
      disabled={props.busy}
      onClose={mode.close}
    />
  ) : (
    <ReviewTextVoiceForm
      access={props.voice}
      ids={mode.ids}
      recordingMaximum={reviewTextRecordingMaximum(props.editor, mode.ids[0])}
      disabled={props.busy}
      onClose={mode.close}
    />
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
  const [focus, setFocus] = useState({ id: '', revision: 0 });
  const [opened, setOpened] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const consumedCreation = useRef(props.editor.createdId);
  const fragments = props.editor.document.fragments;
  const query = queryReviewText(fragments, props.snapshots, filters, selected);
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
    focus,
    open: (id: string) => {
      setOpened(id);
      setFocus((current) => ({ id, revision: current.revision + 1 }));
    },
    toggleOpened: (id: string) => setOpened((current) => (current === id ? null : id)),
    toggleSelected: (id: string) =>
      setSelected((current) =>
        current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
      ),
    limit,
    setLimit,
    fragments,
    query,
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
  onRewrite?: ((ids: readonly string[]) => void) | undefined;
  onSubtitles(ids: readonly string[]): void;
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
            {props.onRewrite && (
              <ReviewButton
                data-text-voice-trigger="rewrite:batch"
                label={translate('gallery.videoReview.textRewriteSelected')}
                className={buttonClass}
                disabled={props.busy || !props.query.eligible.length}
                onClick={() => props.onRewrite?.(props.query.eligible)}
              >
                {translate('gallery.videoReview.textRewriteSelected')}
              </ReviewButton>
            )}
            <ReviewButton
              data-text-voice-trigger="subtitles:batch"
              label={translate('gallery.videoReview.subtitlesSelected')}
              className={buttonClass}
              disabled={props.busy || !props.query.eligible.length}
              onClick={() => props.onSubtitles(props.query.eligible)}
            >
              {translate('gallery.videoReview.subtitlesSelected')}
            </ReviewButton>
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

function TextPhraseVoiceActions({
  fragment,
  busy,
  mode,
}: {
  fragment: import('../../features/video/review/text-document').ReviewTextFragment;
  busy: boolean;
  mode: ReturnType<typeof useReviewTextFormMode>;
}) {
  return (
    <>
      <ReviewButton
        data-text-voice-trigger={`fragment:${fragment.id}`}
        label={translate('gallery.videoReview.speechGenerate')}
        className={`${reviewTextButtonClassName} !w-8 !px-0`}
        disabled={busy || !fragment.text.trim()}
        onClick={() => mode.open([fragment.id], `fragment:${fragment.id}`)}
      >
        <Volume2 size={14} />
      </ReviewButton>
      <ReviewButton
        data-text-voice-trigger={`rewrite:${fragment.id}`}
        label={translate('gallery.videoReview.textRewriteTitle')}
        className={`${reviewTextButtonClassName} !w-8 !px-0`}
        disabled={busy}
        onClick={() => mode.open([fragment.id], `rewrite:${fragment.id}`, 'rewrite')}
      >
        <WandSparkles size={14} />
      </ReviewButton>
    </>
  );
}

function TextDocumentCommands({
  props,
  mode,
  fragments,
  onAdd,
}: {
  props: TextDocumentPanelProps;
  mode: ReturnType<typeof useReviewTextFormMode>;
  fragments: import('../../features/video/review/text-document').ReviewTextFragment[];
  onAdd(): void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <ReviewButton
        data-text-voice-trigger="subtitles:all"
        label={translate('gallery.videoReview.subtitlesTitle')}
        className={`${reviewTextButtonClassName} !w-8 !px-0`}
        disabled={props.busy || !fragments.length}
        onClick={() =>
          mode.open(
            fragments.map((fragment) => fragment.id),
            'subtitles:all',
            'subtitles',
            true
          )
        }
      >
        <Download size={14} />
      </ReviewButton>
      {props.voice && (
        <ReviewButton
          data-text-voice-trigger="rewrite:all"
          label={translate('gallery.videoReview.textRewriteAll')}
          className={`${reviewTextButtonClassName} !w-8 !px-0`}
          disabled={props.busy || !fragments.length}
          onClick={() =>
            mode.open(
              fragments.map((entry) => entry.id),
              'rewrite:all',
              'rewrite',
              true
            )
          }
        >
          <WandSparkles size={14} />
        </ReviewButton>
      )}
      <ReviewButton
        label={translate('gallery.videoReview.textFragmentAdd')}
        className={`${reviewTextButtonClassName} !w-8 !px-0`}
        disabled={props.busy || props.editor.projection.resultDuration <= 0}
        onClick={onAdd}
      >
        <Plus size={14} />
      </ReviewButton>
    </div>
  );
}

/** One contextual command strip keeps prose free of repeated controls. */
function TextDocumentContext({
  props,
  list,
  mode,
}: {
  props: TextDocumentPanelProps;
  list: ReturnType<typeof useReviewTextDocumentList>;
  mode: ReturnType<typeof useReviewTextFormMode>;
}) {
  const ids = list.selected.length
    ? list.query.eligible
    : list.opened && list.query.found.some((fragment) => fragment.id === list.opened)
      ? [list.opened]
      : [];
  const active = list.query.found.find((fragment) => fragment.id === ids[0]);
  if (!active) return null;
  const open = (kind: 'voice' | 'rewrite' | 'subtitles') => {
    props.editor.endTyping();
    mode.open(ids, `document:${kind}`, kind);
  };
  return (
    <div
      data-ui="text-document.actions"
      data-selected-count={ids.length}
      className={[
        'sticky top-0 z-10 flex flex-wrap items-center gap-1',
        'bg-[rgb(from_var(--sniptale-color-surface-panel)_r_g_b_/_1)] py-1',
      ].join(' ')}
    >
      {ids.length > 1 && (
        <span role="status" className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('gallery.videoReview.speechBatchSelected').replace(
            '{count}',
            String(ids.length)
          )}
        </span>
      )}
      <ReviewButton
        label={translate('gallery.videoReview.textPhraseEdit')}
        className={reviewTextButtonClassName}
        disabled={props.busy || ids.length !== 1}
        onClick={() => list.open(active.id)}
      >
        <Pencil size={14} />
      </ReviewButton>
      {props.onPlay && (
        <ReviewButton
          label={translate('gallery.videoReview.textPlayFromHere')}
          className={reviewTextButtonClassName}
          disabled={props.busy}
          onClick={() => props.onPlay?.(active)}
        >
          <Play size={14} />
        </ReviewButton>
      )}
      {props.onCut && (
        <ReviewButton
          label={translate('gallery.videoReview.textCut')}
          className={reviewTextButtonClassName}
          disabled={props.busy || !props.canCut?.(ids)}
          onClick={() => props.onCut?.(ids)}
        >
          <Scissors size={14} />
        </ReviewButton>
      )}
      {props.voice && (
        <>
          <ReviewButton
            data-text-voice-trigger="document:voice"
            label={translate('gallery.videoReview.speechGenerateSelected')}
            className={reviewTextButtonClassName}
            disabled={props.busy || (ids.length === 1 && !active.text.trim())}
            onClick={() => open('voice')}
          >
            <Volume2 size={14} />
          </ReviewButton>
          <ReviewButton
            data-text-voice-trigger="document:rewrite"
            label={translate('gallery.videoReview.textRewriteSelected')}
            className={reviewTextButtonClassName}
            disabled={props.busy}
            onClick={() => open('rewrite')}
          >
            <WandSparkles size={14} />
          </ReviewButton>
        </>
      )}
      <ReviewButton
        data-text-voice-trigger="document:subtitles"
        label={translate('gallery.videoReview.subtitlesSelected')}
        className={reviewTextButtonClassName}
        disabled={props.busy}
        onClick={() => open('subtitles')}
      >
        <Download size={14} />
      </ReviewButton>
    </div>
  );
}
