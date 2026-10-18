import { useLayoutEffect, useRef } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { X } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { ScenarioCaptureMetadataDialog } from '../../../../features/scenario/capture-metadata-dialog';
import type { ScenarioRecorderSidebarStep } from './types';

function useSidebarOverlayFocus(isOpen: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    const dialog = container?.matches('[role="dialog"]')
      ? container
      : container?.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const root = dialog.getRootNode();
    const focusRoot = root instanceof ShadowRoot ? root : dialog.ownerDocument;
    const previous = focusRoot.activeElement;
    dialog.setAttribute('aria-modal', 'true');
    dialog.tabIndex = -1;
    const buttons = () => [...dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
    (buttons()[0] ?? dialog).focus({ preventScroll: true });
    const onKeyDown = (event: Event) => {
      if (!dialog.contains(focusRoot.activeElement) || !('key' in event) || event.defaultPrevented)
        return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const targets = buttons();
        const index = targets.findIndex((target) => target === focusRoot.activeElement);
        const backwards = 'shiftKey' in event && event.shiftKey === true;
        const next = (index + (backwards ? -1 : 1) + targets.length) % targets.length;
        (targets[next] ?? dialog).focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    if (root instanceof ShadowRoot) root.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (root instanceof ShadowRoot) root.removeEventListener('keydown', onKeyDown, true);
      const current = focusRoot.activeElement;
      const remainsInLayer =
        !current || current === dialog.ownerDocument.body || dialog.contains(current);
      if (remainsInLayer && previous instanceof HTMLElement && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);
  return containerRef;
}

export function ScenarioRecorderSidebarMetadataModal(props: {
  inspectedStep: ScenarioRecorderSidebarStep | null;
  onClose: () => void;
}) {
  const container = useSidebarOverlayFocus(Boolean(props.inspectedStep?.metadata), props.onClose);
  return props.inspectedStep?.metadata ? (
    <div ref={container}>
      <ScenarioCaptureMetadataDialog
        onClose={props.onClose}
        stepTitle={props.inspectedStep.title}
        view={props.inspectedStep.metadata}
      />
    </div>
  ) : null;
}

export function ScenarioRecorderSidebarPreviewOverlay(props: {
  onClose: () => void;
  step: ScenarioRecorderSidebarStep | null;
}) {
  const container = useSidebarOverlayFocus(Boolean(props.step), props.onClose);
  if (!props.step) {
    return null;
  }

  return (
    <div
      ref={container}
      role="dialog"
      aria-label={props.step.title || translate('gallery.keyboard.preview')}
      data-ui="content.scenario.sidebar.floating-preview"
      className="sniptale-compact-workspace fixed inset-0 z-[2147483647] flex items-center justify-center
        bg-[color:color-mix(in_srgb,var(--sniptale-color-overlay)_74%,transparent)] p-6"
      style={{ pointerEvents: 'auto' }}
      onClick={createPreviewOverlayBackdropClickHandler(props.onClose)}
    >
      <div
        className="relative max-h-full max-w-[min(1120px,100%)] overflow-hidden rounded-[8px] border
          border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_82%,transparent)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_98%,transparent)] p-3"
        onClick={(event) => event.stopPropagation()}
      >
        <PreviewOverlayCloseButton onClose={props.onClose} />
        <img
          src={props.step.previewDataUrl}
          alt={props.step.title}
          className="max-h-[calc(100vh-96px)] w-full object-contain"
        />
      </div>
    </div>
  );
}

function createPreviewOverlayBackdropClickHandler(onClose: () => void) {
  return (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };
}

function PreviewOverlayCloseButton(props: { onClose: () => void }) {
  return (
    <ProductActionButton
      tone="secondary"
      data-command-chrome="true"
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        props.onClose();
      }}
      data-ui="content.scenario.sidebar.floating-preview-close"
      className="absolute right-3 top-3 inline-flex size-8 items-center justify-center"
      aria-label={translate('common.actions.close')}
      title={translate('common.actions.close')}
    >
      <X className="h-4 w-4" />
    </ProductActionButton>
  );
}
