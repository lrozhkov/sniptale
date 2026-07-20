import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { ScenarioDeckExportAssetControls } from './asset-controls';
import { ScenarioDeckExportFormatControls } from './format-controls';
import { ScenarioDeckExportOptionToggles } from './option-toggles';
import { ScenarioDeckExportHeader, ScenarioDeckExportStatusMessage } from './shared';
import type { ScenarioDeckExportDialogProps } from './types';
import {
  useScenarioDeckExportDialogState,
  type ScenarioDeckExportStatus,
} from './use-dialog-state';

export function ScenarioDeckExportDialog(props: ScenarioDeckExportDialogProps) {
  const state = useScenarioDeckExportDialogState(props.onExport);

  return (
    <ProductModal
      onClose={props.onClose}
      closeOnBackdrop
      width="min(860px, calc(100vw - 48px))"
      maxHeight="88vh"
      scrollable
    >
      <ProductModalHeader
        title={<ScenarioDeckExportHeader projectName={props.project.name} />}
        onClose={props.onClose}
      />
      <ProductModalBody className="gap-4">
        <div
          className="grid gap-4 rounded-[20px] border border-[var(--sniptale-color-border-soft)]
            bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_74%,transparent)] p-4"
        >
          <ScenarioDeckExportFormatControls options={state.options} onChange={state.setOptions} />
          <ScenarioDeckExportAssetControls options={state.options} onChange={state.setOptions} />
          <ScenarioDeckExportOptionToggles options={state.options} onChange={state.setOptions} />
        </div>
        <ScenarioDeckExportStatusMessage
          error={state.error}
          result={state.lastResult}
          status={state.status}
        />
      </ProductModalBody>
      <ProductModalFooter className="justify-end">
        <ScenarioDeckExportActions
          onClose={props.onClose}
          onExport={state.exportDeck}
          status={state.status}
        />
      </ProductModalFooter>
    </ProductModal>
  );
}

function ScenarioDeckExportActions(props: {
  onClose: () => void;
  onExport: () => Promise<void>;
  status: ScenarioDeckExportStatus;
}) {
  const exporting = props.status === 'exporting';

  return (
    <>
      <ProductActionButton tone="secondary" onClick={props.onClose} disabled={exporting}>
        Close
      </ProductActionButton>
      <ProductActionButton
        tone="primary"
        onClick={() => void props.onExport()}
        disabled={exporting}
      >
        {exporting ? 'Exporting...' : 'Export'}
      </ProductActionButton>
    </>
  );
}
