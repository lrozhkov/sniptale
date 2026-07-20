import type { ScenarioDeckExportFormat } from '../../project/export/deck/types';
import { SegmentedRow } from '../../../ui/compact-inspector-controls';
import { setScenarioDeckExportFormat } from './state';
import type { ScenarioDeckExportControlProps } from './types';

const FORMAT_OPTIONS: Array<{ label: string; value: ScenarioDeckExportFormat }> = [
  { label: 'HTML deck', value: 'html' },
  { label: 'Markdown bundle', value: 'markdown' },
];

export function ScenarioDeckExportFormatControls(props: ScenarioDeckExportControlProps) {
  return (
    <SegmentedRow
      ariaLabel="Export format"
      columns={2}
      label="Format"
      value={props.options.format}
      options={FORMAT_OPTIONS}
      onChange={(format) => props.onChange(setScenarioDeckExportFormat(props.options, format))}
    />
  );
}
