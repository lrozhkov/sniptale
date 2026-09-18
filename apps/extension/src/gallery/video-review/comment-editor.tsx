import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { translate } from '../../platform/i18n';
import type { CanvasComment } from '../../features/video/review/types';
import { ReviewButton, reviewTimeLabel } from './controls';

/** Editor for one selected overlay comment: text, zoom behavior, and visibility flags. */
export function ReviewCanvasCommentEditor(props: {
  comment: CanvasComment;
  busy: boolean;
  onPatch(patch: Partial<Omit<CanvasComment, 'id'>>): void;
  onDraft?(id: string, text: string): void;
  onDelete(): void;
}) {
  const [text, setText] = useState(props.comment.text);
  const timer = useRef<number | null>(null);
  const committed = useRef<string | null>(null);
  const textRef = useRef(text);
  const propsRef = useRef(props);
  useEffect(() => {
    textRef.current = text;
  }, [text]);
  useEffect(() => {
    propsRef.current = props;
  });
  // A late persisted prop must never cancel an in-progress local draft; only a
  // fresh comment identity (or a quiet external change) resets the editor.
  useEffect(() => {
    const current = propsRef.current;
    setText(current.comment.text);
    committed.current = null;
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [props.comment.id]);
  useEffect(
    () => () => {
      if (textRef.current !== propsRef.current.comment.text)
        propsRef.current.onPatch({ text: textRef.current });
    },
    []
  );
  useEffect(() => {
    if (props.comment.text === committed.current) {
      committed.current = null;
      return;
    }
    if (timer.current === null && textRef.current === committed.current)
      setText(props.comment.text);
  }, [props.comment.text]);
  const commit = (value: string) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (value !== props.comment.text) {
      committed.current = value;
      props.onPatch({ text: value });
    }
  };
  const change = (value: string) => {
    setText(value);
    props.onDraft?.(props.comment.id, value);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(value), 320);
  };
  return (
    <div
      data-ui="gallery.videoReview.canvasCommentEditor"
      className="space-y-2 rounded-lg
        border border-[var(--sniptale-color-accent)] p-3"
    >
      <label className="block text-xs text-[var(--sniptale-color-text-muted)]">
        {translate('gallery.videoReview.overlayText')}
        <textarea
          data-ui="gallery.videoReview.overlayTextInput"
          value={text}
          disabled={props.busy}
          onChange={(event) => change(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          className="mt-1 w-full resize-none rounded-md border
              border-[var(--sniptale-color-border-soft)] p-2 text-sm"
          rows={3}
        />
      </label>
      <fieldset className="space-y-1">
        <legend className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.behaviorAtZoom')}
        </legend>
        <div className="flex flex-wrap gap-1">
          <ReviewButton
            label={translate('gallery.videoReview.followVideo')}
            aria-pressed={props.comment.attachment === 'content'}
            disabled={props.busy}
            className="!border-0 !bg-transparent !shadow-none !text-xs
                aria-pressed:!bg-[var(--sniptale-color-accent-soft)]"
            onClick={() => {
              if (props.comment.attachment !== 'content') props.onPatch({ attachment: 'content' });
            }}
          />
          <ReviewButton
            label={translate('gallery.videoReview.stayOnScreen')}
            aria-pressed={props.comment.attachment === 'viewport'}
            disabled={props.busy}
            className="!border-0 !bg-transparent !shadow-none !text-xs
                aria-pressed:!bg-[var(--sniptale-color-accent-soft)]"
            onClick={() => {
              if (props.comment.attachment !== 'viewport')
                props.onPatch({ attachment: 'viewport' });
            }}
          />
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <ReviewButton
          label={translate('gallery.videoReview.overlayVisible')}
          aria-pressed={props.comment.visible}
          disabled={props.busy}
          className="!text-xs aria-pressed:!bg-[var(--sniptale-color-accent-soft)]"
          onClick={() => props.onPatch({ visible: !props.comment.visible })}
        />
        <ReviewButton
          label={translate('gallery.videoReview.overlayRenderToVideo')}
          aria-pressed={props.comment.renderToVideo}
          disabled={props.busy}
          className="!text-xs aria-pressed:!bg-[var(--sniptale-color-accent-soft)]"
          onClick={() => props.onPatch({ renderToVideo: !props.comment.renderToVideo })}
        />
        <ReviewButton
          label={translate('gallery.videoReview.overlayDelete')}
          disabled={props.busy}
          className="!border-0 !bg-transparent !shadow-none !text-xs"
          onClick={props.onDelete}
        >
          {translate('gallery.videoReview.overlayDelete')}
        </ReviewButton>
      </div>
    </div>
  );
}

/** Inspector section for overlay comments: the list plus the editor of the selection. */
export function ReviewCanvasCommentsSection(props: {
  comments: readonly CanvasComment[];
  selectedId: string | null;
  busy: boolean;
  onSelect(id: string): void;
  onAdd(): void;
  onPatch(comment: CanvasComment, patch: Partial<Omit<CanvasComment, 'id'>>): void;
  onDraft(id: string, text: string): void;
  onDelete(comment: CanvasComment): void;
  flushTexts(): Promise<void>;
}) {
  const selected = props.comments.find((comment) => comment.id === props.selectedId) ?? null;
  return (
    <div data-ui="gallery.videoReview.canvasComments" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {translate('gallery.videoReview.overlayComments')}
        </h3>
        <ReviewButton
          label={translate('gallery.videoReview.addOverlayComment')}
          disabled={props.busy}
          className="!h-7 !min-h-7 !border-0 !bg-transparent !shadow-none"
          onClick={props.onAdd}
        >
          <Plus size={16} />
        </ReviewButton>
      </div>
      {props.comments.length ? (
        <ol className="space-y-2">
          {props.comments.map((comment) => (
            <li
              key={comment.id}
              className={`rounded-lg border p-3 ${
                props.selectedId === comment.id
                  ? 'border-[var(--sniptale-color-accent)]'
                  : 'border-[var(--sniptale-color-border-soft)]'
              }`}
            >
              <button
                type="button"
                className="block w-full text-left"
                onClick={() => props.onSelect(comment.id)}
              >
                <span className="text-xs tabular-nums text-[var(--sniptale-color-text-muted)]">
                  {comment.start === undefined
                    ? translate('gallery.videoReview.overlayComments')
                    : reviewTimeLabel(comment.start)}
                </span>
                <span className="mt-1 block whitespace-pre-wrap break-words text-sm">
                  {comment.text.trim()
                    ? comment.text
                    : translate('gallery.videoReview.overlayPoint')}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.overlayComments')}
        </p>
      )}
      {selected ? (
        <ReviewCanvasCommentEditor
          comment={selected}
          busy={props.busy}
          onPatch={(patch) => void props.onPatch(selected, patch)}
          onDraft={props.onDraft}
          onDelete={() => void props.onDelete(selected)}
        />
      ) : null}
    </div>
  );
}
