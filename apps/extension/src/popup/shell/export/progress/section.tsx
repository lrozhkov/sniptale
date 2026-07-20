import type { ExportProgressSectionProps } from './types';
import { ExportProgressSectionView } from './view';

export function ExportProgressSection(props: ExportProgressSectionProps) {
  return <ExportProgressSectionView {...props} />;
}
