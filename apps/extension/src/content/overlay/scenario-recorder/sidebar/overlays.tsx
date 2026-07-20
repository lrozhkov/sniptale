import { X } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { ScenarioCaptureMetadataDialog } from '../../../../features/scenario/capture-metadata-dialog';
import type { ScenarioRecorderSidebarStep } from './types';

export function ScenarioRecorderSidebarMetadataModal(props: {
  inspectedStep: ScenarioRecorderSidebarStep | null;
  onClose: () => void;
}) {
  return props.inspectedStep?.metadata ? (
    <ScenarioCaptureMetadataDialog
      onClose={props.onClose}
      stepTitle={props.inspectedStep.title}
      view={props.inspectedStep.metadata}
    />
  ) : null;
}

export function ScenarioRecorderSidebarPreviewOverlay(props: {
  onClose: () => void;
  step: ScenarioRecorderSidebarStep | null;
}) {
  if (!props.step) {
    return null;
  }

  return (
    <div
      data-ui="content.scenario.sidebar.floating-preview"
      className="fixed inset-0 z-[2147483647] flex items-center justify-center
        bg-[color:color-mix(in_srgb,var(--sniptale-color-overlay)_74%,transparent)] p-6"
      style={{ pointerEvents: 'auto' }}
      onClick={createPreviewOverlayBackdropClickHandler(props.onClose)}
    >
      <div
        className="relative max-h-full max-w-[min(1120px,100%)] overflow-hidden rounded-[24px] border
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
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        props.onClose();
      }}
      data-ui="content.scenario.sidebar.floating-preview-close"
      className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full
        border border-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_58%,transparent)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]
        shadow-[0_10px_22px_color-mix(in_srgb,var(--sniptale-color-overlay)_24%,transparent)]
        backdrop-blur-[8px]
        text-[var(--sniptale-color-text-primary)] transition
        hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_72%,transparent)]
        hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_92%,transparent)]"
      aria-label={translate('common.actions.close')}
      title={translate('common.actions.close')}
    >
      <X className="h-4 w-4" />
    </button>
  );
}
