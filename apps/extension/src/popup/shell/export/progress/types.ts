import type { ExportProgress, PopupExportResult } from '@sniptale/runtime-contracts/export';
import type { PopupExportProgressStep } from './steps';

export interface ExportProgressSectionProps {
  isExporting: boolean;
  onCancel: () => void;
  progress: ExportProgress;
  progressSteps: PopupExportProgressStep[];
  result: PopupExportResult | null;
}
