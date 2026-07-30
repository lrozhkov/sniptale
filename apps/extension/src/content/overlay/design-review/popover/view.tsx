import {
  Check,
  ChevronDown,
  ClipboardCopy,
  FileSearch,
  ListMinus,
  MessageCircleQuestion,
  Pencil,
  Trash2,
  WandSparkles,
  Wrench,
  X,
} from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from 'react';
import type { BrowserDesignReviewAction } from '../../../parser/page-preparation/annotations';
import { translate, type TranslationKey } from '../../../../platform/i18n';
import { DesignReviewSettings } from '../settings/view';
import type { DesignReviewActions, DesignReviewViewState } from '../types';
import { PageStyleCommentField } from './comment';

const POPOVER_WIDTH = 480;
const VIEWPORT_GAP = 12;

interface PopoverMetrics {
  height: number;
  viewportHeight: number;
  viewportWidth: number;
}

type ReviewActionOption = {
  action: BrowserDesignReviewAction;
  icon: ComponentType<{ className?: string; size?: number }>;
  labelKey: TranslationKey;
};

const REVIEW_ACTIONS: ReviewActionOption[] = [
  { action: 'refine', icon: WandSparkles, labelKey: 'content.designReview.actionRefine' },
  { action: 'fix', icon: Wrench, labelKey: 'content.designReview.actionFix' },
  { action: 'simplify', icon: ListMinus, labelKey: 'content.designReview.actionSimplify' },
  { action: 'verify', icon: FileSearch, labelKey: 'content.designReview.actionVerify' },
  {
    action: 'explain',
    icon: MessageCircleQuestion,
    labelKey: 'content.designReview.actionExplain',
  },
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function resolvePopoverPosition(
  anchor: { x: number; y: number },
  expanded: boolean,
  metrics: PopoverMetrics | null
) {
  const viewportWidth = metrics?.viewportWidth ?? window.innerWidth;
  const viewportHeight = metrics?.viewportHeight ?? window.innerHeight;
  const maxHeight = Math.max(0, viewportHeight - VIEWPORT_GAP * 2);
  const width = Math.min(POPOVER_WIDTH, Math.max(0, viewportWidth - VIEWPORT_GAP * 2));
  const measuredHeight = metrics?.height ?? (expanded ? 620 : 310);
  const height = Math.min(measuredHeight, maxHeight);
  const preferredLeft =
    anchor.x + VIEWPORT_GAP + width <= viewportWidth - VIEWPORT_GAP
      ? anchor.x + VIEWPORT_GAP
      : anchor.x - width - VIEWPORT_GAP;
  const preferredTop =
    anchor.y + VIEWPORT_GAP + height <= viewportHeight - VIEWPORT_GAP
      ? anchor.y + VIEWPORT_GAP
      : anchor.y - height - VIEWPORT_GAP;
  return {
    left: clamp(preferredLeft, VIEWPORT_GAP, viewportWidth - width - VIEWPORT_GAP),
    maxHeight,
    top: clamp(preferredTop, VIEWPORT_GAP, viewportHeight - height - VIEWPORT_GAP),
    width,
  };
}

function usePopoverMetrics(args: {
  active: boolean;
  elementRef: RefObject<HTMLElement | null>;
  measurementKey: string;
}): PopoverMetrics | null {
  const [metrics, setMetrics] = useState<PopoverMetrics | null>(null);

  useLayoutEffect(() => {
    const element = args.elementRef.current;
    if (!args.active || !element) {
      setMetrics(null);
      return;
    }

    const measure = () => {
      const rect = element.getBoundingClientRect();
      const next = {
        height: rect.height,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
      setMetrics((current) =>
        current?.height === next.height &&
        current.viewportHeight === next.viewportHeight &&
        current.viewportWidth === next.viewportWidth
          ? current
          : next
      );
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [args.active, args.elementRef, args.measurementKey]);

  return metrics;
}

function ActionMenu(props: {
  action: BrowserDesignReviewAction;
  onSelect: (action: BrowserDesignReviewAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = REVIEW_ACTIONS.find((option) => option.action === props.action)!;
  const SelectedIcon = selected.icon;

  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        className={[
          'inline-flex h-8 items-center gap-2 rounded-[8px] px-2 text-xs font-semibold',
          props.action === 'fix'
            ? 'text-[var(--sniptale-color-danger)]'
            : 'text-[var(--sniptale-color-text-primary)]',
        ].join(' ')}
        onClick={() => setOpen((current) => !current)}
      >
        <SelectedIcon size={16} />
        {translate(selected.labelKey)}
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div
          className={[
            'z-10 mt-1 min-w-0 rounded-[10px] border p-1 shadow-xl',
            'border-[color:var(--sniptale-color-border-soft)]',
            'bg-[var(--sniptale-color-surface-panel)]',
          ].join(' ')}
          data-ui="content.design-review.action-menu"
          role="menu"
        >
          {REVIEW_ACTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.action}
                type="button"
                className={[
                  'flex w-full items-center gap-2 rounded-[7px] px-2 py-2 text-left text-xs',
                  'hover:bg-[var(--sniptale-color-surface-input)]',
                  option.action === 'fix'
                    ? 'text-[var(--sniptale-color-danger)]'
                    : 'text-[var(--sniptale-color-text-primary)]',
                ].join(' ')}
                role="menuitem"
                onClick={() => {
                  props.onSelect(option.action);
                  setOpen(false);
                }}
              >
                <Icon size={16} />
                <span className="flex-1">{translate(option.labelKey)}</span>
                {option.action === props.action ? <Check size={14} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ElementBar(props: {
  actions: DesignReviewActions;
  onDeleteRequest: () => void;
  state: DesignReviewViewState;
}) {
  const selection = props.state.selection;
  if (!selection) {
    return null;
  }

  return (
    <div
      className={[
        'flex min-w-0 items-center gap-2 border-t px-3 py-2',
        'border-[color:var(--sniptale-color-border-soft)]',
      ].join(' ')}
    >
      <span className="shrink-0 text-xs text-[var(--sniptale-color-text-dim)]">
        {selection.tagName.toUpperCase()}
      </span>
      <strong className="max-w-32 truncate text-xs">
        {selection.textPreview || selection.tagName}
      </strong>
      <button
        type="button"
        className={[
          'min-w-0 flex-1 truncate text-left font-mono text-[10px]',
          'text-[var(--sniptale-color-text-dim)]',
          'hover:text-[var(--sniptale-color-text-primary)]',
        ].join(' ')}
        title={selection.domPath}
        onClick={() => void props.actions.copyPath()}
      >
        {selection.domPath}
      </button>
      <button
        type="button"
        className={[
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border',
          'border-[color:var(--sniptale-color-border-soft)]',
        ].join(' ')}
        aria-label={translate('content.designReview.copyElement')}
        title={translate('content.designReview.copyElement')}
        onClick={() => void props.actions.copyElement()}
      >
        <ClipboardCopy size={16} />
      </button>
      <button
        type="button"
        className={[
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border',
          'border-[color:var(--sniptale-color-border-soft)]',
        ].join(' ')}
        aria-label={translate('content.designReview.editProperties')}
        aria-pressed={props.state.settingsOpen}
        title={translate('content.designReview.editProperties')}
        onClick={() => props.actions.setSettingsOpen(!props.state.settingsOpen)}
      >
        <Pencil size={16} />
      </button>
      <button
        type="button"
        className={[
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border',
          'border-[color:var(--sniptale-color-border-soft)]',
          'text-[var(--sniptale-color-danger)]',
        ].join(' ')}
        aria-label={translate('content.designReview.deleteFeedback')}
        title={translate('content.designReview.deleteFeedback')}
        onClick={props.onDeleteRequest}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function DeleteConfirmation(props: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div
      className={[
        'min-w-0 border-t p-3',
        'border-[color:var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-panel)]',
      ].join(' ')}
      data-ui="content.design-review.delete-confirmation"
    >
      <div className="text-sm font-bold">
        {translate('content.designReview.deleteConfirmTitle')}
      </div>
      <p className="mt-1 text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
        {translate('content.designReview.deleteConfirmBody')}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="h-9 rounded-[8px] border border-[color:var(--sniptale-color-border-soft)] text-xs font-semibold"
          onClick={props.onCancel}
        >
          {translate('content.designReview.cancel')}
        </button>
        <button
          type="button"
          className="h-9 rounded-[8px] bg-[var(--sniptale-color-danger)] text-xs font-semibold text-white"
          onClick={props.onConfirm}
        >
          {translate('content.designReview.delete')}
        </button>
      </div>
    </div>
  );
}

export function DesignReviewPopover(props: {
  actions: DesignReviewActions;
  open: boolean;
  state: DesignReviewViewState;
}) {
  const [deleteRequested, setDeleteRequested] = useState(false);
  const popoverRef = useRef<HTMLElement | null>(null);
  const previousSelectionRef = useRef<Element | null>(null);
  const selectionElement = props.state.selection?.element ?? null;
  const active = Boolean(props.open && props.state.anchor && props.state.selection);
  const metrics = usePopoverMetrics({
    active,
    elementRef: popoverRef,
    measurementKey: `${props.state.selection?.domPath ?? ''}:${props.state.settingsOpen}:${deleteRequested}`,
  });

  useEffect(() => {
    if (previousSelectionRef.current !== selectionElement) {
      previousSelectionRef.current = selectionElement;
      setDeleteRequested(false);
    }
  }, [selectionElement]);

  if (!props.open || !props.state.anchor || !props.state.selection) {
    return null;
  }

  const position = resolvePopoverPosition(props.state.anchor, props.state.settingsOpen, metrics);
  return (
    <aside
      ref={popoverRef}
      data-ui="content.design-review.popover"
      className={[
        'pointer-events-auto fixed z-[2147483646] max-h-[calc(100vh-24px)] overflow-visible',
        'rounded-[12px] border shadow-2xl',
        'border-[color:var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      style={{ left: position.left, top: position.top, width: position.width }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onWheelCapture={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={[
          'absolute -right-3 -top-3 inline-flex h-8 w-8 items-center justify-center',
          'rounded-full border shadow-md',
          'border-[color:var(--sniptale-color-border-soft)]',
          'bg-[var(--sniptale-color-surface-panel)]',
        ].join(' ')}
        aria-label={translate('content.designReview.close')}
        title={translate('content.designReview.close')}
        onClick={props.actions.close}
      >
        <X size={16} />
      </button>
      <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: position.maxHeight }}>
        <div className="p-3 pb-2">
          <PageStyleCommentField
            actions={{ ...props.actions.comment, close: props.actions.close }}
            disabled={false}
            state={props.state.comment}
          />
          <div className="mt-1 flex items-center justify-between">
            <ActionMenu action={props.state.action} onSelect={props.actions.selectAction} />
            <span className="text-[10px] text-[var(--sniptale-color-text-dim)]">
              {translate('content.designReview.enterHint')}
            </span>
          </div>
        </div>
        <ElementBar
          actions={props.actions}
          onDeleteRequest={() => setDeleteRequested(true)}
          state={props.state}
        />
        {deleteRequested ? (
          <DeleteConfirmation
            onCancel={() => setDeleteRequested(false)}
            onConfirm={props.actions.delete}
          />
        ) : null}
        {props.state.settingsOpen ? (
          <div
            className={[
              'max-h-[min(52vh,32rem)] overflow-y-auto border-t',
              'border-[color:var(--sniptale-color-border-soft)]',
            ].join(' ')}
          >
            <DesignReviewSettings actions={props.actions} disabled={false} state={props.state} />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
