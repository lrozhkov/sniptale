import type { GridPanelBodyProps } from './types';
import { GridPanelSections } from './sections';

export function GridPanelBody(props: GridPanelBodyProps) {
  return <GridPanelSections {...props} />;
}
