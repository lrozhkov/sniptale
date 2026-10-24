import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { translate } from '../../platform/i18n';

export type ReadingPreferences = {
  fontSize: number | null;
  columnWidth: number | null;
  fadeEdges: boolean;
  focusGuide: boolean;
};
const READER_CLASS = [
  'h-full min-h-20 overflow-y-auto overscroll-contain rounded-[4px]',
  'bg-[var(--sniptale-color-surface-panel)] [font-family:var(--sniptale-font-document-sans)]',
  'text-start leading-[1.5] whitespace-pre-wrap [overflow-wrap:anywhere]',
].join(' ');

/** Keeps reader effects outside the scroll owner and leaves the scrollbar unobscured. */
export function TeleprompterReader(props: {
  reader: RefObject<HTMLDivElement | null>;
  text: string;
  preferences: ReadingPreferences;
  onPause: () => void;
  onFontSize: (fontSize: number) => void;
}) {
  const { reader: readerRef, onPause, onFontSize } = props;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [edges, setEdges] = useState({ top: false, bottom: false, scrollbar: 0 });
  const [selecting, setSelecting] = useState(false);
  const previousLayout = useRef<{
    width: number;
    end: number;
    fontSize: number;
    columnWidth: number | null;
  } | null>(null);
  const fontSize =
    props.preferences.fontSize ??
    Math.max(24, Math.min(32, Math.round(24 + (size.width - 360) / 70)));
  const updateEdges = useCallback(() => {
    const reader = readerRef.current;
    if (!reader) return;
    setEdges({
      top: reader.scrollTop > 1,
      bottom: reader.scrollTop + reader.clientHeight < reader.scrollHeight - 1,
      scrollbar: Math.max(0, reader.offsetWidth - reader.clientWidth),
    });
  }, [readerRef]);

  useLayoutEffect(() => {
    const reader = readerRef.current;
    if (!reader) return;
    const surface = reader.closest('[data-recording-surface]');
    let detach = () => {};
    const bind = () => {
      detach();
      const ownerDocument = reader.ownerDocument;
      const view = ownerDocument.defaultView;
      if (!view) return;
      const measure = () => setSize({ width: reader.clientWidth, height: reader.clientHeight });
      const selection = () => {
        const selected = ownerDocument.getSelection();
        setSelecting(!!selected && !selected.isCollapsed && reader.contains(selected.anchorNode));
      };
      const observer =
        typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(measure) : null;
      observer?.observe(reader);
      view.addEventListener('resize', measure);
      ownerDocument.addEventListener('selectionchange', selection);
      measure();
      selection();
      detach = () => {
        observer?.disconnect();
        view.removeEventListener('resize', measure);
        ownerDocument.removeEventListener('selectionchange', selection);
      };
    };
    bind();
    surface?.addEventListener('sniptale-recording-surface-change', bind);
    return () => {
      detach();
      surface?.removeEventListener('sniptale-recording-surface-change', bind);
    };
  }, [readerRef]);

  useLayoutEffect(() => {
    const reader = readerRef.current;
    if (!reader) return;
    const previous = previousLayout.current;
    const end = Math.max(0, reader.scrollHeight - reader.clientHeight);
    const reflow =
      previous &&
      previous.width > 0 &&
      (previous.width !== size.width ||
        previous.fontSize !== fontSize ||
        previous.columnWidth !== props.preferences.columnWidth);
    if (reflow) {
      onPause();
      // Reflow preserves approximate progress. Pixel offsets cannot identify the same words after wrapping.
      if (previous.end > 0) reader.scrollTop = Math.min(1, reader.scrollTop / previous.end) * end;
    }
    previousLayout.current = {
      width: size.width,
      end,
      fontSize,
      columnWidth: props.preferences.columnWidth,
    };
    onFontSize(fontSize);
    updateEdges();
  }, [
    fontSize,
    props.preferences.columnWidth,
    size.width,
    size.height,
    readerRef,
    onPause,
    onFontSize,
    updateEdges,
  ]);

  return (
    <div className="relative min-h-20 min-w-0 flex-1 overflow-hidden rounded-[4px]">
      <div
        ref={props.reader}
        role="region"
        aria-label={translate('popup.video.teleprompterScript')}
        tabIndex={0}
        className={READER_CLASS}
        style={{
          fontSize,
          paddingBlock: '0.5em',
          paddingInline: 'clamp(12px, 4%, 48px)',
          overflowAnchor: 'none',
        }}
        onScroll={updateEdges}
        onWheel={props.onPause}
        onTouchStart={props.onPause}
        onPointerDown={props.onPause}
        onKeyDown={(event) => {
          if (
            ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)
          )
            onPause();
        }}
      >
        <div
          data-teleprompter-column=""
          className="mx-auto min-w-0"
          style={{
            width: '100%',
            maxWidth: `${props.preferences.columnWidth ?? 40}ch`,
          }}
        >
          {props.text}
        </div>
      </div>
      <ReaderEffects
        preferences={props.preferences}
        fontSize={fontSize}
        height={size.height}
        edges={edges}
        selecting={selecting}
      />
    </div>
  );
}

function ReaderEffects(props: {
  preferences: ReadingPreferences;
  fontSize: number;
  height: number;
  edges: { top: boolean; bottom: boolean; scrollbar: number };
  selecting: boolean;
}) {
  const { fontSize, edges } = props;
  const fadeHeight = Math.min(fontSize * 0.8, Math.max(0, props.height * 0.1));
  const effects = !props.selecting;
  return (
    <>
      {effects && props.preferences.focusGuide ? (
        <div
          aria-hidden="true"
          data-teleprompter-guide=""
          className="pointer-events-none absolute start-0 border-y border-[var(--sniptale-color-border-soft)]"
          style={{ top: '35%', height: `${fontSize * 1.5}px`, insetInlineEnd: edges.scrollbar }}
        />
      ) : null}
      {effects && props.preferences.fadeEdges ? (
        <>
          {edges.top ? (
            <ReaderFade edge="top" height={fadeHeight} scrollbar={edges.scrollbar} />
          ) : null}
          {edges.bottom ? (
            <ReaderFade edge="bottom" height={fadeHeight} scrollbar={edges.scrollbar} />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function ReaderFade(props: { edge: 'top' | 'bottom'; height: number; scrollbar: number }) {
  const direction = props.edge === 'top' ? 'bottom' : 'top';
  const surface = 'var(--sniptale-color-surface-panel)';
  return (
    <div
      aria-hidden="true"
      data-teleprompter-fade={props.edge}
      className="pointer-events-none absolute start-0"
      style={{
        [props.edge]: 0,
        height: props.height,
        insetInlineEnd: props.scrollbar,
        background: `linear-gradient(to ${direction}, ${surface}, transparent)`,
      }}
    />
  );
}
