import type { ReactNode } from 'react';
import { translate } from '../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductModal } from '@sniptale/ui/product-modal';

export interface EmbeddedEditorState {
  error: string | null;
  iframeUrl: string | null;
  loading: boolean;
  saving: boolean;
}

function ScenarioEmbeddedEditorTitle(props: { title: string; titleId?: string }) {
  return (
    <span id={props.titleId ?? 'scenario-embedded-editor-title'} className="sr-only">
      {props.title}
    </span>
  );
}

export function ScenarioEmbeddedEditorModal(props: {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  state: EmbeddedEditorState;
  title: string;
}) {
  return (
    <ProductModal
      labelledBy={props.labelledBy}
      onClose={props.onClose}
      closeOnBackdrop
      width="calc(100vw - 24px)"
      maxHeight="calc(100vh - 24px)"
      dialogClassName="h-[calc(100vh-24px)] overflow-hidden"
    >
      <ScenarioEmbeddedEditorTitle title={props.title} titleId={props.labelledBy} />
      <ScenarioEmbeddedEditorPanel state={props.state}>
        {props.children}
      </ScenarioEmbeddedEditorPanel>
    </ProductModal>
  );
}

function ScenarioEmbeddedEditorPanel(props: { children: ReactNode; state: EmbeddedEditorState }) {
  return (
    <div
      className="relative flex min-h-0 flex-1 overflow-hidden
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,var(--sniptale-color-surface-canvas)_6%)]"
    >
      {props.state.saving ? <ScenarioEmbeddedEditorSavingBadge /> : null}
      {props.children}
    </div>
  );
}

export function ScenarioEmbeddedEditorBody(props: {
  assignIframeRef: (node: HTMLIFrameElement | null) => void;
  error: string | null;
  iframeTitle: string;
  iframeUrl: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  if (props.loading) {
    return (
      <div className="grid h-full place-items-center px-6">
        <div
          className="rounded-[20px] border border-[var(--sniptale-color-border-soft)]
            bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]
            px-5 py-3 text-sm text-[var(--sniptale-color-text-secondary)]"
        >
          {translate('scenario.editor.loading')}
        </div>
      </div>
    );
  }

  if (props.error) {
    return <ScenarioEmbeddedEditorErrorState error={props.error} onClose={props.onClose} />;
  }

  return props.iframeUrl ? (
    <iframe
      ref={props.assignIframeRef}
      src={props.iframeUrl}
      title={props.iframeTitle}
      className="h-full w-full border-0"
    />
  ) : null;
}

function ScenarioEmbeddedEditorSavingBadge() {
  return (
    <div
      className="pointer-events-none absolute right-4 top-4 z-10 rounded-full border
        border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,var(--sniptale-color-surface-canvas)_10%)]
        px-3 py-1.5 text-sm text-[var(--sniptale-color-text-secondary)]"
    >
      {translate('common.states.saving')}
    </div>
  );
}

function ScenarioEmbeddedEditorErrorState(props: { error: string; onClose: () => void }) {
  return (
    <div className="grid h-full place-items-center gap-4 px-6 text-center">
      <div
        className="max-w-[420px] rounded-[20px] border border-[var(--sniptale-color-border-soft)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)] px-5 py-4"
      >
        <div className="text-sm text-[var(--sniptale-color-danger)]">{props.error}</div>
      </div>
      <ProductActionButton tone="secondary" onClick={props.onClose}>
        {translate('editor.documentActions.returnToScenario')}
      </ProductActionButton>
    </div>
  );
}
