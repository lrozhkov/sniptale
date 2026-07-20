import type { ScenarioDeckExportResult } from '../../project/export/deck/types';
import type { ScenarioDeckExportStatus } from './use-dialog-state';

export function ScenarioDeckExportHeader(props: { projectName: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-[var(--sniptale-color-text-primary)]">
        Export scenario deck
      </h2>
      <p className="mt-1 text-sm text-[var(--sniptale-color-text-muted)]">{props.projectName}</p>
    </div>
  );
}

export function ScenarioDeckExportStatusMessage(props: {
  error: string | null;
  result: ScenarioDeckExportResult | null;
  status: ScenarioDeckExportStatus;
}) {
  if (props.status === 'error') {
    return <p className="text-sm text-[var(--sniptale-color-danger)]">{props.error}</p>;
  }
  if (!props.result) {
    return null;
  }
  if (props.result.missingAssetIds.length > 0) {
    return (
      <p className="text-sm text-[var(--sniptale-color-warning)]">
        Exported with missing assets: {props.result.missingAssetIds.join(', ')}
      </p>
    );
  }

  return <p className="text-sm text-[var(--sniptale-color-success)]">Export created.</p>;
}
