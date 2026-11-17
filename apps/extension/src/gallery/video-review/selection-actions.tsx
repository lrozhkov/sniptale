import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  createContext,
  useContext,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReviewSelection } from '../../features/video/review/types';
import { translate } from '../../platform/i18n';
import './selection-actions.css';
import { Copy, Download, RotateCcw, Trash2 } from 'lucide-react';
import { Icon } from '@iconify/react';
import containerIcon from '@iconify-icons/tabler/container';
import { ReviewButton } from './controls';
import {
  type ReviewSelectionCommand,
  type ReviewSelectionCommandSlots,
} from './selection-command-slots';

type Anchor = { key: string };
type Target = Anchor & {
  disabled: boolean;
  commandHost: HTMLFieldSetElement | null;
  commandSlots: ReviewSelectionCommandSlots;
  dismiss(): void;
};
export const ReviewSelectionActionsContext = createContext<Target | null>(null);

type MultiSelection = {
  keys: readonly string[];
  clear(): void;
  captureModified(event: ReactPointerEvent): boolean;
  deleteAction: { current: (() => void) | null };
};
export const ReviewTimelineMultiSelectionContext = createContext<MultiSelection | null>(null);

/** DOM keys identify authored items; lane owners still validate selection and mutation. */
function reviewTimelineElementKey(element: HTMLElement): string | undefined {
  return (
    element.dataset['reviewRemovalKey'] ??
    element.dataset['reviewActionKey'] ??
    (element.dataset['cursorFocusKey']
      ? `cursor-focus:${element.dataset['cursorFocusKey']}`
      : undefined)
  );
}

function reviewTimelineSelectionKey(selection: ReviewSelection): string | null {
  switch (selection.kind) {
    case 'edit':
      return `edit:${selection.id}`;
    case 'zoom':
      return `focus:${selection.id}`;
    case 'annotation-effect':
      return `annotation:${selection.id}`;
    case 'text':
      return `text:${selection.id}`;
    case 'audio':
      return `audio:${selection.id}`;
    case 'original-audio':
      return `original-audio:${selection.id}`;
    case 'telemetry':
      return `telemetry:${selection.ref.kind}:${selection.ref.id}`;
    case 'cursor-motion':
      return `cursor-motion:${selection.id}`;
    case 'cursor-focus':
      return `cursor-focus:${selection.id}`;
    case 'zoom-link':
      return `zoom-link:${selection.id}`;
    case 'webcam-position':
      return `webcam-position:${selection.id}`;
    case 'webcam-hidden':
      return `webcam-hidden:${selection.id}`;
    default:
      return null;
  }
}

/** Retains only a transient click anchor; selected-object authority stays in the editor session. */
export function useReviewSelectionActions(
  selection: ReviewSelection,
  visible: boolean,
  disabled: boolean,
  onSelectKey?: ((key: string | null) => void) | undefined
) {
  const selectedKey = reviewTimelineSelectionKey(selection);
  const [interaction, setInteraction] = useState<{
    selectionKey: string | null;
    visible: boolean;
    multi: boolean;
    key: string | null | undefined;
  }>({ selectionKey: selectedKey, visible, multi: false, key: undefined });
  const [commandHost, setHost] = useState<HTMLFieldSetElement | null>(null);
  const [commandSlots, setSlots] = useState<ReviewSelectionCommandSlots>({});
  const setSlot = useCallback((action: ReviewSelectionCommand, host: HTMLSpanElement | null) => {
    setSlots((current) => (current[action] === host ? current : { ...current, [action]: host }));
  }, []);
  const [keys, setKeys] = useState<readonly string[]>([]);
  const previous = useRef<string | null>(null);
  const deleteAction = useRef<(() => void) | null>(null);
  const multi = keys.length > 1;
  useLayoutEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>('[data-review-multi-selected]');
    for (const node of nodes) delete node.dataset['reviewMultiSelected'];
    if (!multi) return;
    for (const node of document.querySelectorAll<HTMLElement>(
      '[data-review-removal-key],[data-review-action-key],[data-cursor-focus-key]'
    ))
      if (keys.includes(reviewTimelineElementKey(node) ?? ''))
        node.dataset['reviewMultiSelected'] = 'true';
    return () => {
      for (const node of document.querySelectorAll<HTMLElement>('[data-review-multi-selected]'))
        delete node.dataset['reviewMultiSelected'];
    };
  }, [keys, multi, selection]);
  const anchoredKey = interaction.key === undefined ? selectedKey : interaction.key;
  // Selection/visibility changes expire only transient dismissal or click overrides.
  // Reset before commit so consumers never lose the new canonical action identity.
  if (
    interaction.key !== undefined &&
    (interaction.selectionKey !== selectedKey ||
      interaction.visible !== visible ||
      interaction.multi !== multi)
  )
    setInteraction({
      selectionKey: selectedKey,
      visible,
      multi,
      key:
        !visible || (multi && selectedKey === null) ? anchoredKey : multi ? selectedKey : undefined,
    });
  const setAnchor = useCallback(
    (key: string | null) => {
      setInteraction((current) => {
        const currentKey = current.key === undefined ? selectedKey : current.key;
        return currentKey === key &&
          (current.key === undefined ||
            (current.selectionKey === selectedKey &&
              current.visible === visible &&
              current.multi === multi))
          ? current
          : { selectionKey: selectedKey, visible, multi, key };
      });
    },
    [selectedKey, visible, multi]
  );
  const clear = useCallback(() => setKeys((current) => (current.length ? [] : current)), []);
  const captureModified = (event: ReactPointerEvent): boolean => {
    if (
      disabled ||
      event.button !== 0 ||
      !(event.ctrlKey || event.metaKey || event.shiftKey) ||
      !(event.target instanceof Element)
    )
      return false;
    const element = event.target.closest<HTMLElement>(
      '[data-review-removal-key],[data-review-action-key],[data-cursor-focus-key]'
    );
    const timeline = element?.closest('[data-ui="gallery.videoReview.timeline"]');
    const key = element && reviewTimelineElementKey(element);
    if (!element || !timeline || !key) return false;
    const items = [
      ...timeline.querySelectorAll<HTMLElement>(
        '[data-review-removal-key],[data-review-action-key],[data-cursor-focus-key]'
      ),
    ].filter((item) => item.getClientRects().length > 0);
    const lanes = [...timeline.querySelectorAll<HTMLElement>('[data-review-track]')];
    items.sort((a, b) => {
      const laneA = a.closest<HTMLElement>('[data-review-track]');
      const laneB = b.closest<HTMLElement>('[data-review-track]');
      return (
        (laneA && laneB ? lanes.indexOf(laneA) - lanes.indexOf(laneB) : 0) ||
        a.getBoundingClientRect().left - b.getBoundingClientRect().left
      );
    });
    const ordered = [
      ...new Set(items.map(reviewTimelineElementKey).filter((value): value is string => !!value)),
    ];
    const initial = keys.length
      ? keys.filter((key) => ordered.includes(key))
      : [reviewTimelineSelectionKey(selection)].filter(
          (value): value is string => !!value && ordered.includes(value)
        );
    const from = previous.current ? ordered.indexOf(previous.current) : -1;
    const to = ordered.indexOf(key);
    const range =
      event.shiftKey && from >= 0 && to >= 0
        ? ordered.slice(Math.min(from, to), Math.max(from, to) + 1)
        : [key];
    const next = event.shiftKey
      ? event.ctrlKey || event.metaKey
        ? [...new Set([...initial, ...range])]
        : range
      : initial.includes(key)
        ? initial.filter((item) => item !== key)
        : [...initial, key];
    setKeys(next);
    if (!event.shiftKey) previous.current = key;
    const activeKey = next.includes(key) ? key : (next.at(-1) ?? null);
    const activeElement = items.find((item) => reviewTimelineElementKey(item) === activeKey);
    // Modified gestures own an explicit group anchor, including a canonical-key match.
    setInteraction({
      selectionKey: selectedKey,
      visible,
      multi,
      key: activeElement && activeKey ? activeKey : null,
    });
    onSelectKey?.(activeKey);
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  const capture = (event: { target: EventTarget; clientX?: number; button?: number }) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (
      !(event.target instanceof Element) ||
      event.target.closest('[data-playback-range-edge]') ||
      !event.target.closest('[data-ui="gallery.videoReview.timeline"]') ||
      event.target.closest('[data-ui="gallery.videoReview.toolbar"]')
    )
      return;
    const element = event.target.closest<HTMLElement>(
      '[data-review-removal-key],[data-review-action-key],[data-cursor-focus-key]'
    );
    const key =
      element?.dataset['reviewRemovalKey'] ??
      element?.dataset['reviewActionKey'] ??
      (element?.dataset['cursorFocusKey']
        ? `cursor-focus:${element.dataset['cursorFocusKey']}`
        : undefined);
    if (!element || !key) {
      setAnchor(null);
      clear();
      previous.current = null;
      return;
    }
    // Modified gestures are admitted after the lane owner updates track focus.
    if (
      !(
        'ctrlKey' in event &&
        (event.ctrlKey ||
          ('metaKey' in event && event.metaKey) ||
          ('shiftKey' in event && event.shiftKey))
      )
    ) {
      clear();
      previous.current = key;
    }
    setAnchor(key);
  };
  const captureModifiedRef = useRef(captureModified);
  captureModifiedRef.current = captureModified;
  const captureMulti = useCallback(
    (event: ReactPointerEvent) => captureModifiedRef.current(event),
    []
  );
  const dismiss = useCallback(() => setAnchor(null), [setAnchor]);
  const target = useMemo(
    () =>
      visible && anchoredKey && (multi || anchoredKey === selectedKey)
        ? { key: anchoredKey, disabled, commandHost, commandSlots, dismiss }
        : null,
    [visible, anchoredKey, multi, selectedKey, disabled, commandHost, commandSlots, dismiss]
  );
  const multiSelection = useMemo(
    () => ({ keys, clear, captureModified: captureMulti, deleteAction }),
    [keys, clear, captureMulti]
  );
  return {
    capture,
    multiSelection,
    setHost,
    setSlot,
    target,
  };
}

const ReviewSelectionActionsHostContext = createContext<{
  setHost(host: HTMLFieldSetElement | null): void;
  setSlot(action: ReviewSelectionCommand, host: HTMLSpanElement | null): void;
  selectInterval?: (() => void) | undefined;
  fragment?: ReactNode;
  disabled: boolean;
} | null>(null);

function ReviewSelectionActionSlot({
  action,
  setSlot,
}: {
  action: ReviewSelectionCommand;
  setSlot(action: ReviewSelectionCommand, host: HTMLSpanElement | null): void;
}) {
  const ref = useCallback(
    (host: HTMLSpanElement | null) => setSlot(action, host),
    [action, setSlot]
  );
  const Glyph = action === 'duplicate' ? Copy : action === 'reset' ? RotateCcw : Trash2;
  const label = translate(
    action === 'duplicate'
      ? 'gallery.videoReview.selectionDuplicate'
      : action === 'reset'
        ? 'gallery.videoReview.selectionReset'
        : 'gallery.videoReview.deleteSelected'
  );
  return (
    <span ref={ref} className="review-selection-action-slot" data-selection-slot={action}>
      <ReviewButton label={label} disabled className="review-selection-action-fallback">
        <Glyph size={16} aria-hidden="true" />
      </ReviewButton>
    </span>
  );
}

/** The main toolbar hosts the selected object's existing commands. */
export function ReviewSelectionActionsToolbar() {
  const target = useContext(ReviewSelectionActionsContext);
  const host = useContext(ReviewSelectionActionsHostContext);
  if (!host) return null;
  return (
    <fieldset
      role="toolbar"
      aria-label={translate('gallery.videoReview.actionActions')}
      data-ui="gallery.videoReview.selectionActions"
      className="review-timeline-selection-actions"
      disabled={host.disabled}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          target?.dismiss();
        }
      }}
    >
      <span className="review-selection-action-slot" data-selection-slot="interval">
        <ReviewButton
          label={translate('gallery.videoReview.selectionInterval')}
          disabled={!host.selectInterval || (target?.disabled ?? true)}
          onClick={host.selectInterval}
        >
          <Icon icon={containerIcon} width={16} height={16} aria-hidden="true" />
        </ReviewButton>
      </span>
      <span className="review-selection-action-slot" data-selection-slot="fragment">
        {host.fragment ?? (
          <ReviewButton label={translate('gallery.videoReview.downloadSelection')} disabled>
            <Download size={16} />
          </ReviewButton>
        )}
      </span>
      {(['duplicate', 'reset', 'delete'] as const).map((action) => (
        <ReviewSelectionActionSlot key={action} action={action} setSlot={host.setSlot} />
      ))}
      <fieldset ref={host.setHost} className="review-selection-specific-actions" />
    </fieldset>
  );
}

/** Keeps click anchoring and the modal command host in one transient interaction owner. */
export function ReviewSelectionActionsSurface(props: {
  selection: ReviewSelection;
  visible: boolean;
  disabled: boolean;
  onSelectKey?: ((key: string | null) => void) | undefined;
  onSelectInterval?: ((keys: readonly string[]) => void) | undefined;
  fragmentAction?: ((keys: readonly string[]) => ReactNode) | undefined;
  children: ReactNode;
}) {
  const actions = useReviewSelectionActions(
    props.selection,
    props.visible,
    props.disabled,
    props.onSelectKey
  );
  const { onSelectInterval, fragmentAction, disabled } = props;
  const hosts = useMemo(
    () => ({
      setHost: actions.setHost,
      setSlot: actions.setSlot,
      fragment: fragmentAction?.(actions.multiSelection.keys),
      disabled,
      selectInterval: onSelectInterval
        ? () => onSelectInterval(actions.multiSelection.keys)
        : undefined,
    }),
    [
      actions.setHost,
      actions.setSlot,
      actions.multiSelection.keys,
      onSelectInterval,
      fragmentAction,
      disabled,
    ]
  );
  const pointer = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  return (
    <ReviewTimelineMultiSelectionContext value={actions.multiSelection}>
      <ReviewSelectionActionsContext value={actions.target}>
        <ReviewSelectionActionsHostContext value={hosts}>
          <div
            data-ui="gallery.videoReview.workspaceScroll"
            className="h-full min-h-0 overflow-x-auto overflow-y-hidden"
            onPointerDownCapture={(event) => {
              event.currentTarget.dataset['reviewPointerSelection'] = 'true';
              pointer.current =
                event.button === 0 &&
                event.target instanceof Element &&
                !event.target.closest('[data-ui="gallery.videoReview.toolbar"]') &&
                event.target.closest(
                  '[data-review-removal-key],[data-review-action-key],[data-cursor-focus-key]'
                )
                  ? { x: event.clientX, y: event.clientY, moved: false }
                  : null;
            }}
            onPointerMoveCapture={(event) => {
              const current = pointer.current;
              if (current && event.buttons)
                current.moved ||=
                  Math.hypot(event.clientX - current.x, event.clientY - current.y) > 3;
            }}
            onPointerCancelCapture={() => {
              pointer.current = null;
            }}
            onClickCapture={(event) => {
              const moved = event.detail > 0 && pointer.current?.moved;
              pointer.current = null;
              if (moved) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              actions.capture(event);
              if (
                (event.ctrlKey || event.metaKey || event.shiftKey) &&
                event.target instanceof Element &&
                event.target.closest(
                  '[data-review-removal-key],[data-review-action-key],[data-cursor-focus-key]'
                )
              ) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onKeyDownCapture={(event) => {
              if (
                ['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(
                  event.key
                )
              )
                delete event.currentTarget.dataset['reviewPointerSelection'];
              if (
                actions.multiSelection.keys.length > 1 &&
                (event.key === 'Delete' || event.key === 'Backspace') &&
                event.target instanceof Element &&
                !event.target.closest('input,textarea,[contenteditable="true"]')
              ) {
                event.preventDefault();
                event.stopPropagation();
                actions.multiSelection.deleteAction.current?.();
                return;
              }
              if (event.key === 'Escape' && actions.multiSelection.keys.length > 1) {
                event.preventDefault();
                event.stopPropagation();
                actions.multiSelection.clear();
                return;
              }
              if (event.key === 'Enter' || event.key === ' ') actions.capture(event);
            }}
          >
            {props.children}
          </div>
        </ReviewSelectionActionsHostContext>
      </ReviewSelectionActionsContext>
    </ReviewTimelineMultiSelectionContext>
  );
}
