import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { useGuideAiSession } from './use-ai-session';
import { GuideAiRequestForm } from './ai-request-form';
import './ai-assistant.css';

type AssistantProps = {
  project: GuideProject;
  selectedStepId: string | null;
  selectedBlockId: string | null;
  disabled: boolean;
  onOpen: () => void;
  onChange: (project: GuideProject) => void;
  onReload: () => Promise<void>;
  t: Translate;
};

/** Interprets page readiness and the selected block for the AI entry point. */
export function GuideAiEntry(
  props: Omit<AssistantProps, 'project'> & { project: GuideProject | null; status: string }
) {
  if (!props.project) return null;
  const step = props.project.items.find((item) => item.id === props.selectedStepId);
  const block =
    step?.kind === 'step' ? step.blocks.find((block) => block.id === props.selectedBlockId) : null;
  return (
    <GuideAiAssistant
      {...props}
      project={props.project}
      selectedBlockId={block && block.kind !== 'image-slot' ? block.id : null}
      disabled={props.disabled || !['ready', 'saved'].includes(props.status)}
    />
  );
}

/** Owns an explicit assistance entry point and theme-safe modal lifetime. */
export function GuideAiAssistant(props: AssistantProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const theme = useResolvedPortalTheme(anchor.current);
  return (
    <span ref={anchor}>
      <ContentToolbarButton
        title={props.t('scenario.editor.guideAiOpen')}
        disabled={props.disabled || !props.project.items.some((item) => item.kind === 'step')}
        onClick={() => {
          props.onOpen();
          setOpen(true);
        }}
      >
        <Sparkles size={16} aria-hidden="true" />
      </ContentToolbarButton>
      {open &&
        createPortal(
          <div className="sniptale-ai-modal-root" data-theme={theme ?? undefined}>
            <GuideAiDialog {...props} onClose={() => setOpen(false)} />
          </div>,
          resolveThemeSafePortalTarget(anchor.current)
        )}
    </span>
  );
}

function useDialogFocus(onClose: () => void) {
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const dialog = container.current?.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog) {
      dialog.setAttribute('aria-modal', 'true');
      dialog.tabIndex = -1;
      (dialog.querySelector<HTMLElement>('textarea') ?? dialog).focus();
    }
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [
      ...event.currentTarget.querySelectorAll<HTMLElement>('button,input,textarea,[tabindex]'),
    ].filter(
      (node) =>
        node.tabIndex >= 0 &&
        !node.matches(':disabled') &&
        !node.closest('[hidden],[inert]') &&
        node.getClientRects().length > 0
    );
    const first = controls[0];
    const last = controls.at(-1);
    if (!first) {
      event.preventDefault();
      event.currentTarget.focus();
    } else if (
      event.shiftKey ? document.activeElement === first : document.activeElement === last
    ) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  };
  return { container, keyboard };
}

function GuideAiDialog({
  project,
  selectedStepId,
  selectedBlockId,
  disabled,
  onChange,
  onReload,
  onClose,
  t,
}: AssistantProps & { onClose: () => void }) {
  const titleId = useId();
  const { container, keyboard } = useDialogFocus(onClose);
  const session = useGuideAiSession({
    project,
    selectedStepId,
    selectedBlockId,
    onChange,
    onClose,
    t,
  });
  const {
    instruction,
    modelId,
    pending,
    failure,
    proposal,
    accepted,
    scope,
    run,
    cancel,
    editRequest,
  } = session;
  return (
    <div ref={container}>
      <ProductModal
        onClose={onClose}
        onKeyDown={keyboard}
        labelledBy={titleId}
        width="min(760px, calc(100vw - 32px))"
        maxHeight="calc(100dvh - 32px)"
        scrollable
      >
        <ProductModalHeader
          compact
          title={<span id={titleId}>{t('scenario.editor.guideAiOpen')}</span>}
          onClose={onClose}
          closeTitle={t('scenario.editor.close')}
        />
        <ProductModalBody compact>
          <div className="guide-ai-body">
            {proposal ? (
              <GuideAiProposalReview session={session} t={t} />
            ) : (
              <GuideAiRequestForm
                session={session}
                selectedStepId={selectedStepId}
                selectedBlockId={selectedBlockId}
                t={t}
              />
            )}
            {failure && (
              <p role="alert">
                {t(
                  failure === 'stale'
                    ? 'scenario.editor.guideAiStale'
                    : 'scenario.editor.guideAiFailed'
                )}
              </p>
            )}
            {failure === 'stale' && (
              <ProductActionButton
                tone="secondary"
                compact
                disabled={disabled || pending}
                onClick={() => {
                  onClose();
                  void onReload();
                }}
              >
                {t('scenario.editor.guideAiReload')}
              </ProductActionButton>
            )}
            {pending && <p role="status">{t('scenario.editor.guideAiPending')}</p>}
          </div>
        </ProductModalBody>
        <ProductModalFooter compact>
          <ProductActionButton tone="secondary" compact onClick={pending ? cancel : onClose}>
            {t(pending ? 'scenario.editor.guideAiCancelWaiting' : 'common.actions.cancel')}
          </ProductActionButton>
          {proposal && (
            <ProductActionButton tone="secondary" compact disabled={pending} onClick={editRequest}>
              {t('scenario.editor.guideAiBack')}
            </ProductActionButton>
          )}
          <ProductActionButton
            tone="primary"
            compact
            disabled={
              pending ||
              (proposal
                ? accepted.size === 0
                : !modelId || !scope.stepIds.length || !instruction.trim())
            }
            onClick={() => void run(proposal !== null)}
          >
            {t(proposal ? 'scenario.editor.guideAiApply' : 'scenario.editor.guideAiSend')}
          </ProductActionButton>
        </ProductModalFooter>
      </ProductModal>
    </div>
  );
}

function GuideAiProposalReview({
  session,
  t,
}: {
  session: ReturnType<typeof useGuideAiSession>;
  t: Translate;
}) {
  const { proposal, steps, pending, accepted, chooseChange } = session;
  if (!proposal) return null;
  return (
    <div className="guide-ai-proposals">
      <p>{t('scenario.editor.guideAiReview')}</p>
      {!proposal.changes.length && <p role="status">{t('scenario.editor.guideAiNoChanges')}</p>}
      {proposal.changes.map((change, index) => (
        <label className="guide-ai-change" key={index}>
          <input
            type="checkbox"
            disabled={pending}
            checked={accepted.has(index)}
            aria-label={`${t('scenario.editor.guideAiAcceptChange')} ${index + 1}`}
            onChange={(event) => chooseChange(index, event.target.checked)}
          />
          <span>
            <small>
              {steps.find((step) => step.id === change.operation.stepId)?.title ||
                t('scenario.editor.guideAiStep')}{' '}
              ·{' '}
              {t(
                (
                  {
                    setStepTitle: 'scenario.editor.guideStepTitle',
                    setHeading: 'scenario.editor.guideHeading',
                    setText: 'scenario.editor.guideAddText',
                    setNote: 'scenario.editor.guideAddNote',
                    setImageCaption: 'scenario.editor.guideImageCaption',
                    setImageAlt: 'scenario.editor.guideImageAlt',
                  } as const
                )[change.operation.type]
              )}
            </small>
            <small>{t('scenario.editor.guideAiBefore')}</small>
            <span className="guide-ai-before">{change.before || '—'}</span>
          </span>
          <span>
            <small>{t('scenario.editor.guideAiAfter')}</small>
            <span>{change.after || '—'}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
