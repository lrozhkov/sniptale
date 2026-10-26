import { Fragment, useRef } from 'react';

// Surface styles disable selection on descendants; each prose node must explicitly opt in.
const proseSelection = { userSelect: 'text', WebkitUserSelect: 'text' } as const;

/** A readable text projection. Runtime consumers own phrase clocks, actions and durable edits. */
export function TextDocument(props: {
  label: string;
  phrases: readonly { id: string; text: string; unavailable?: boolean | undefined }[];
  selectedIds: readonly string[];
  onSelection(ids: string[]): void;
  onActivate(id: string): void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const anchor = useRef<string | null>(null);
  const dragged = useRef(false);
  const pointer = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const selectRange = () => {
    const selection = root.current?.ownerDocument.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return false;
    const range = selection.getRangeAt(0);
    const ids = [...(root.current?.querySelectorAll<HTMLElement>('[data-text-phrase-id]') ?? [])]
      .filter((node) => {
        if (!range.intersectsNode(node)) return false;
        const overlap = node.ownerDocument.createRange();
        overlap.selectNodeContents(node);
        if (range.compareBoundaryPoints(Range.START_TO_START, overlap) > 0)
          overlap.setStart(range.startContainer, range.startOffset);
        if (range.compareBoundaryPoints(Range.END_TO_END, overlap) < 0)
          overlap.setEnd(range.endContainer, range.endOffset);
        return overlap.toString().length > 0;
      })
      .flatMap((node) => node.dataset['textPhraseId'] ?? []);
    if (!ids.length) return false;
    props.onSelection(ids);
    return true;
  };
  return (
    <div
      ref={root}
      data-ui="text-document"
      style={proseSelection}
      aria-label={props.label}
      className={[
        'min-w-0 select-text whitespace-pre-wrap break-words',
        '[font-family:var(--sniptale-font-document-sans)] text-sm leading-relaxed',
        'text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      onPointerDown={(event) => {
        dragged.current = false;
        pointer.current =
          event.button === 0
            ? { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
            : null;
      }}
      onPointerMove={(event) => {
        const start = pointer.current;
        if (
          start &&
          start.id === event.pointerId &&
          Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 3
        )
          start.moved = true;
      }}
      onPointerUp={(event) => {
        const start = pointer.current;
        pointer.current = null;
        // A retained Copy range is not a new drag. Match the shared UI's 3px movement threshold.
        dragged.current = !!start && start.id === event.pointerId && start.moved && selectRange();
      }}
      onPointerCancel={() => {
        pointer.current = null;
        dragged.current = false;
      }}
      onCopy={selectRange}
    >
      {props.phrases.map((phrase, index) => (
        <Fragment key={phrase.id}>
          {index > 0 && !/\s$/u.test(props.phrases[index - 1]!.text) && !/^\s/u.test(phrase.text)
            ? ' '
            : null}
          <span
            role="button"
            data-local-space-activation="true"
            tabIndex={0}
            aria-pressed={props.selectedIds.includes(phrase.id)}
            aria-disabled={phrase.unavailable || undefined}
            data-text-phrase-id={phrase.id}
            style={proseSelection}
            className={[
              'box-decoration-clone cursor-text rounded-sm outline-none',
              'hover:bg-[var(--sniptale-color-surface-hover)] focus-visible:ring-1',
              'focus-visible:ring-[var(--sniptale-color-border-strong)]',
              props.selectedIds.includes(phrase.id)
                ? 'bg-[var(--sniptale-color-surface-hover)]'
                : '',
            ].join(' ')}
            onClick={(event) => {
              if (dragged.current) {
                dragged.current = false;
                return;
              }
              if (event.shiftKey && anchor.current) {
                const from = props.phrases.findIndex((item) => item.id === anchor.current);
                if (from < 0) anchor.current = phrase.id;
                props.onSelection(
                  from < 0
                    ? [phrase.id]
                    : props.phrases
                        .slice(Math.min(from, index), Math.max(from, index) + 1)
                        .map((item) => item.id)
                );
              } else if (event.ctrlKey || event.metaKey) {
                props.onSelection(
                  props.selectedIds.includes(phrase.id)
                    ? props.selectedIds.filter((id) => id !== phrase.id)
                    : [...props.selectedIds, phrase.id]
                );
                anchor.current = phrase.id;
              } else {
                anchor.current = phrase.id;
                props.onSelection([phrase.id]);
                if (!phrase.unavailable) props.onActivate(phrase.id);
              }
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              event.stopPropagation();
              if (event.repeat) return;
              anchor.current = phrase.id;
              props.onSelection([phrase.id]);
              if (!phrase.unavailable) props.onActivate(phrase.id);
            }}
          >
            {phrase.text}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
