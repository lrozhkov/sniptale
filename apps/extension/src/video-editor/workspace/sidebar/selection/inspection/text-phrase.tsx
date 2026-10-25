import { useEffect, useId, useRef, useState } from 'react';
import {
  ChevronDown,
  LocateFixed,
  Merge,
  Scissors,
  Trash2,
  Volume2,
  WandSparkles,
} from 'lucide-react';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import type { VideoProjectTextDocument } from '../../../../../features/video/project/text/types';
import { videoProjectTextPlayhead } from '../../../../../features/video/project/text/authoring';
import { projectVideoProjectTextFragment } from '../../../../../features/video/project/text/projection';
import {
  deleteReviewTextFragments,
  editReviewTextFragment,
  mergeReviewTextFragments,
  reviewTextSplitBoundary,
  splitReviewTextFragment,
} from '../../../../../features/video/review/text-document';
import type { ReviewTextFragment } from '../../../../../features/video/review/text-types';
import { formatNumber, translate, useAppLocale } from '../../../../../platform/i18n';
import { TextareaField } from '../../../../../ui/compact-inspector-controls';
import { InspectorActionButton } from '../shared/actions';
import { NumberInput } from '../inputs/number';
import type { ProjectTextEditor } from './text-editing';
import { FragmentCaptions, TextEditFeedback } from './text-captions';

export function ProjectTextPhrase(props: {
  project: VideoProject;
  entry: VideoProjectTextDocument;
  fragment: ReviewTextFragment;
  next?: ReviewTextFragment | undefined;
  editor: ProjectTextEditor;
  documentView?: boolean;
  visible?: boolean;
  expanded: boolean;
  focus: boolean;
  focusRevision?: number;
  onToggle(): void;
  onRewrite?(): void;
  onVoice?(): void;
  batch?: boolean;
  selected?: boolean;
  onSelect?(): void;
}) {
  const { entry, fragment, editor } = props;
  const locale = useAppLocale();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(fragment.text);
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  const [caret, setCaret] = useState(0);
  const accepted = useRef(fragment.text);
  useEffect(() => {
    if (accepted.current !== fragment.text) {
      accepted.current = fragment.text;
      setDraft(fragment.text);
      setInvalid(false);
    }
  }, [fragment.text]);
  useEffect(() => {
    if (props.expanded && props.focus) {
      textarea.current?.focus({ preventScroll: true });
      textarea.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [props.expanded, props.focus, props.focusRevision]);
  const change = (patch: Parameters<typeof editReviewTextFragment>[2], typing = false) =>
    editor.edit(entry, editReviewTextFragment(entry.document, fragment.id, patch), typing);
  if (props.visible === false && !props.expanded) return null;
  return (
    <article
      className={[
        'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 border-t',
        'border-[var(--sniptale-color-border-soft)] pt-2',
      ].join(' ')}
      data-text-id={fragment.id}
    >
      {!props.documentView && (
        <>
          {props.batch ? (
            <label className="flex h-8 shrink-0 items-center justify-center">
              <input
                type="checkbox"
                className="sniptale-parameter-check"
                aria-label={translate('gallery.videoReview.speechSelectPhrase')}
                checked={props.selected ?? false}
                onChange={props.onSelect}
              />
            </label>
          ) : null}
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs"
            aria-expanded={props.expanded}
            title={fragment.text || translate('gallery.videoReview.textFragment')}
            onClick={props.onToggle}
          >
            <ChevronDown
              size={14}
              className={props.expanded ? 'shrink-0' : '-rotate-90 shrink-0'}
            />
            <span className="min-w-0 flex-1 truncate">
              {fragment.text || translate('gallery.videoReview.textFragment')}
            </span>
            <span className="shrink-0 tabular-nums">
              {formatNumber(
                fragment.start,
                { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                locale
              )}
              –
              {formatNumber(
                fragment.end,
                { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                locale
              )}
            </span>
          </button>
          <ProjectTextPhraseCommands
            fragmentId={fragment.id}
            text={fragment.text}
            {...(props.onRewrite ? { onRewrite: props.onRewrite } : {})}
            {...(props.onVoice ? { onVoice: props.onVoice } : {})}
          />
        </>
      )}
      {props.expanded && (
        <div className="w-full min-w-0 space-y-2">
          <TextareaField
            ref={textarea}
            label={translate('gallery.videoReview.speechText')}
            value={draft}
            aria-invalid={invalid}
            aria-describedby={editor.error ? errorId : undefined}
            onFocus={editor.beginTyping}
            onBlur={editor.endTyping}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
            onChange={(value) => {
              setDraft(value);
              const valid = change({ text: value }, true);
              setInvalid(!valid);
              if (valid) accepted.current = value;
            }}
          />
          <TextEditFeedback error={editor.error} id={errorId} />
          <NumberInput
            label={translate('gallery.videoReview.textFragmentStart')}
            value={fragment.start}
            min={0}
            max={fragment.end}
            step={0.01}
            unit="s"
            scrub={false}
            onChange={(start) => change({ start })}
          />
          <NumberInput
            label={translate('gallery.videoReview.textFragmentEnd')}
            value={fragment.end}
            min={fragment.start}
            max={
              entry.binding.kind === 'source'
                ? (props.project.assets.find(
                    (asset) => entry.binding.kind === 'source' && asset.id === entry.binding.assetId
                  )?.metadata.duration ?? 86_400)
                : 86_400
            }
            step={0.01}
            unit="s"
            scrub={false}
            onChange={(end) => change({ end })}
          />
          <FragmentCaptions entry={entry} fragment={fragment} change={change} />
          <TextPhraseActions
            project={props.project}
            entry={entry}
            fragment={fragment}
            editor={editor}
            next={props.next}
            draft={draft}
            caret={caret}
          />
        </div>
      )}
    </article>
  );
}

/** Phrase navigation and structural commands share source-clock admission. */
function TextPhraseActions(props: {
  project: VideoProject;
  entry: VideoProjectTextDocument;
  fragment: ReviewTextFragment;
  editor: ProjectTextEditor;
  next?: ReviewTextFragment | undefined;
  draft: string;
  caret: number;
}) {
  const { entry, fragment, editor, draft, caret } = props;
  const projection = projectVideoProjectTextFragment(props.project, entry, fragment);
  const playhead = videoProjectTextPlayhead(props.project, entry, editor.playback.time);
  const boundary = reviewTextSplitBoundary(fragment, caret);
  const splitTime =
    playhead !== null && fragment.start < playhead && playhead < fragment.end
      ? playhead
      : undefined;
  const canSplit =
    draft === fragment.text &&
    caret > 0 &&
    caret < draft.length &&
    (!!boundary || splitTime !== undefined);
  const split = () =>
    editor.edit(
      entry,
      splitReviewTextFragment(entry.document, fragment.id, {
        id: crypto.randomUUID(),
        position: caret,
        ...(!boundary && splitTime !== undefined ? { time: splitTime } : {}),
      })
    );
  return (
    <>
      {!projection.ranges.length && (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.sidebar.textSourceExcluded')}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        <InspectorActionButton
          disabled={!projection.ranges.length}
          onClick={() => {
            editor.endTyping();
            editor.playback.setPlaying(false);
            editor.playback.seek(projection.ranges[0]!.start);
          }}
          title={translate('gallery.videoReview.speechJump')}
          iconOnly
        >
          <LocateFixed size={14} />
        </InspectorActionButton>
        <InspectorActionButton
          disabled={!canSplit}
          onClick={split}
          title={translate('gallery.videoReview.textFragmentSplit')}
          iconOnly
        >
          <Scissors size={14} />
        </InspectorActionButton>
        <InspectorActionButton
          disabled={!props.next}
          onClick={() =>
            props.next &&
            editor.edit(entry, mergeReviewTextFragments(entry.document, fragment.id, props.next.id))
          }
          title={translate('gallery.videoReview.textFragmentMerge')}
          iconOnly
        >
          <Merge size={14} />
        </InspectorActionButton>
        <InspectorActionButton
          onClick={() =>
            editor.edit(entry, {
              ok: true,
              document: deleteReviewTextFragments(entry.document, [fragment.id]),
            })
          }
          title={translate('gallery.videoReview.textFragmentDelete')}
          iconOnly
          tone="danger"
        >
          <Trash2 size={14} />
        </InspectorActionButton>
      </div>
    </>
  );
}

function ProjectTextPhraseCommands({
  fragmentId,
  text,
  onRewrite,
  onVoice,
}: {
  fragmentId: string;
  text: string;
  onRewrite?(): void;
  onVoice?(): void;
}) {
  return (
    <>
      {onRewrite ? (
        <InspectorActionButton
          iconOnly
          data-project-text-rewrite={fragmentId}
          title={translate('gallery.videoReview.textRewriteTitle')}
          aria-label={translate('gallery.videoReview.textRewriteTitle')}
          onClick={onRewrite}
        >
          <WandSparkles size={14} aria-hidden="true" />
        </InspectorActionButton>
      ) : null}
      {onVoice ? (
        <InspectorActionButton
          iconOnly
          data-project-text-voice={fragmentId}
          title={translate('gallery.videoReview.speechGenerate')}
          aria-label={translate('gallery.videoReview.speechGenerate')}
          disabled={!text.trim()}
          onClick={onVoice}
        >
          <Volume2 size={14} aria-hidden="true" />
        </InspectorActionButton>
      ) : null}
    </>
  );
}
