import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ScenarioDeckExportAssetControls } from './asset-controls';
import { ScenarioDeckExportFormatControls } from './format-controls';
import { ScenarioDeckExportOptionToggles } from './option-toggles';
import { ScenarioDeckExportStatusMessage } from './shared';
import type { ScenarioDeckExportPanelProps } from './types';
import {
  useScenarioDeckExportDialogState,
  type ScenarioDeckExportStatus,
} from './use-dialog-state';

export { ScenarioDeckExportHeader } from './shared';

export function ScenarioDeckExportPanel(props: ScenarioDeckExportPanelProps) {
  const state = useScenarioDeckExportDialogState(props.onExport);

  return (
    <div className="grid gap-4" data-ui="scenario.deck-export.panel">
      <div className="grid gap-3">
        <ScenarioDeckExportFormatControls options={state.options} onChange={state.setOptions} />
        <ScenarioDeckExportAssetControls options={state.options} onChange={state.setOptions} />
        <ScenarioDeckExportOptionToggles options={state.options} onChange={state.setOptions} />
      </div>
      <ScenarioDeckExportStatusMessage
        error={state.error}
        result={state.lastResult}
        status={state.status}
      />
      <div className="flex justify-end">
        <ScenarioDeckExportAction onExport={state.exportDeck} status={state.status} />
      </div>
    </div>
  );
}

function ScenarioDeckExportAction(props: {
  onExport: () => Promise<void>;
  status: ScenarioDeckExportStatus;
}) {
  const exporting = props.status === 'exporting';

  return (
    <ProductActionButton tone="primary" onClick={() => void props.onExport()} disabled={exporting}>
      {exporting ? 'Exporting...' : 'Export'}
    </ProductActionButton>
  );
}
