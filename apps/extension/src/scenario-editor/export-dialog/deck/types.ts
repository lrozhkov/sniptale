import type {
  ScenarioDeckExportOptions,
  ScenarioDeckExportResult,
} from '../../project/export/deck/types';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';

export interface ScenarioDeckExportDialogProps {
  onClose: () => void;
  onExport: (options: ScenarioDeckExportOptions) => Promise<ScenarioDeckExportResult>;
  project: ScenarioProjectV3;
}

export type ScenarioDeckExportPanelProps = Omit<ScenarioDeckExportDialogProps, 'onClose'>;

export interface ScenarioDeckExportControlProps {
  onChange: (options: ScenarioDeckExportOptions) => void;
  options: ScenarioDeckExportOptions;
}
