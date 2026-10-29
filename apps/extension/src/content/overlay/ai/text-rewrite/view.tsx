import { PageControlVisibility } from '../../toolbar/controls/control-visibility';
import { PageToolbarControlsContext } from '../../toolbar/state/page-controls';
import { useContext, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { useFloatingSurfaceWheelContainment } from '@sniptale/ui/floating-interactions/wheel';
import { translate } from '../../../../platform/i18n';
import { resolveContentOverlayRoot, useContentUiScale } from '../../../platform/dom-host';
import {
  readDesignReviewPopoverTargetRect,
  resolveDesignReviewPopoverPosition,
  useDesignReviewPopoverMetrics,
} from '../../design-review/popover/position';
import { useDesignReviewPopoverDrag } from '../../design-review/popover/drag';
import { useTextRewriteSession } from './session';
import { TextRewriteForm } from './prompt-form';
type Session = ReturnType<typeof useTextRewriteSession>;
function useTextRewritePosition(session: Session, ref: RefObject<HTMLElement | null>) {
  const uiScale = useContentUiScale();
  const target = session.target;
  const metrics = useDesignReviewPopoverMetrics({
    active: target !== null,
    elementRef: ref,
    uiScale,
    measurementKey: [
      session.request.busy,
      session.request.error,
      session.request.providerFailureReason,
      session.models.failed,
      session.models.pending,
      session.models.unavailable,
      session.models.selectionFailed,
    ].join(':'),
  });
  const basePosition = resolveDesignReviewPopoverPosition(
    target ? { x: target.anchor.x / uiScale, y: target.anchor.y / uiScale } : { x: 12, y: 12 },
    readDesignReviewPopoverTargetRect(target?.element ?? null, uiScale),
    false,
    metrics
  );
  const drag = useDesignReviewPopoverDrag({
    active: target !== null,
    basePosition,
    geometryKey: metrics?.height ?? 0,
    popoverRef: ref,
    resetKey: target?.element ?? null,
    uiScale,
  });
  return { basePosition, drag, uiScale };
}

function TextRewritePopover({ session }: { session: Session }) {
  const ref = useRef<HTMLElement | null>(null);
  const containedRef = useFloatingSurfaceWheelContainment(ref);
  const position = useTextRewritePosition(session, ref);
  const target = session.target;
  if (!target) return null;
  return (
    <aside
      ref={containedRef}
      role="dialog"
      aria-label={translate('content.toolbar.aiTextTitle')}
      data-ui="content.ai-text.popover"
      data-floating-ui-capture-transient="true"
      className={[
        'sniptale-design-review-chrome sniptale-compact-workspace pointer-events-auto fixed z-[2147483646]',
        'flex cursor-default flex-col overflow-visible rounded-[4px] border shadow-2xl',
        'border-[color:var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
        'text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      style={{
        backgroundColor: 'rgb(from var(--sniptale-color-surface-panel) r g b / 1)',
        left: position.drag.position.left * position.uiScale,
        top: position.drag.position.top * position.uiScale,
        width: position.basePosition.width,
        maxHeight: position.basePosition.maxHeight,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.nativeEvent.isComposing || event.key !== 'Escape')
          return;
        event.preventDefault();
        event.stopPropagation();
        session.close();
      }}
    >
      <div className="flex min-h-10 shrink-0 items-center gap-2 px-3">
        <div
          className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-2 active:cursor-grabbing"
          data-ui="content.ai-text.drag"
          title={translate('content.designReview.movePopover')}
          onPointerDown={position.drag.onPointerDown}
          onPointerMove={position.drag.onPointerMove}
          onPointerUp={position.drag.onPointerUp}
          onPointerCancel={position.drag.onPointerUp}
        >
          <Sparkles size={14} aria-hidden="true" className="shrink-0" />
          <span
            className="min-w-0 truncate text-xs font-medium"
            data-ui="content.ai-text.source"
            title={target.text}
          >
            {target.text}
          </span>
        </div>
        <ContentToolbarButton
          tone="close"
          type="button"
          dataUi="content.ai-text.close"
          className="sniptale-dismiss-button shrink-0 !size-6 !min-h-6 !min-w-6 !p-0"
          aria-label={translate('content.toolbar.aiTextClose')}
          title={translate('content.toolbar.aiTextClose')}
          onClick={session.close}
        >
          <X size={14} />
        </ContentToolbarButton>
      </div>
      <TextRewriteForm session={session} />
    </aside>
  );
}

/** Keeps the text picker inside Content Editing and renders its form in the canonical overlay root. */
export function TextRewriteControl(props: {
  visible: boolean;
  active: boolean;
  disabled?: boolean;
  onActiveChange(active: boolean): void;
}) {
  const preferences = useContext(PageToolbarControlsContext);
  const active =
    props.active && !preferences?.editing && preferences?.isVisible('editing-ai-text') !== false;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const session = useTextRewriteSession({
    active,
    onClose: () => {
      props.onActiveChange(false);
      triggerRef.current?.focus();
    },
    onApplied: () => triggerRef.current?.focus(),
  });
  const portal = resolveContentOverlayRoot();
  if (!props.visible) return null;
  return (
    <PageControlVisibility
      control="editing-ai-text"
      label={translate('content.toolbar.aiTextSelect')}
    >
      <ContentToolbarButton
        ref={triggerRef}
        type="button"
        disabled={props.disabled}
        active={active}
        aria-pressed={active}
        aria-haspopup="dialog"
        aria-expanded={active && session.target !== null}
        aria-label={translate('content.toolbar.aiTextSelect')}
        title={translate('content.toolbar.aiTextSelectHint')}
        dataUi="content.toolbar.ai-text"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (active ? session.close() : props.onActiveChange(true))}
      >
        <Sparkles size={18} aria-hidden="true" />
      </ContentToolbarButton>
      {active && session.target && portal
        ? createPortal(
            <CommandPressScope value={true}>
              <TextRewritePopover session={session} />
            </CommandPressScope>,
            portal
          )
        : null}
    </PageControlVisibility>
  );
}
