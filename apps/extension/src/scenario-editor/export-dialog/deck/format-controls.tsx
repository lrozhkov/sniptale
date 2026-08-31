import type { ScenarioDeckExportFormat } from '../../project/export/deck/types';
import { SegmentedRow } from '../../../ui/compact-inspector-controls';
import { translate } from '../../../platform/i18n';
import { setScenarioDeckExportFormat } from './state';
import type { ScenarioDeckExportControlProps } from './types';

export function ScenarioDeckExportFormatControls(props: ScenarioDeckExportControlProps) {
  const options: Array<{ label: string; value: ScenarioDeckExportFormat }> = [
    { label: translate('scenario.editor.exportHtmlDeck'), value: 'html' },
    { label: translate('scenario.editor.exportMarkdownBundle'), value: 'markdown' },
  ];
  return (
    <SegmentedRow
      ariaLabel={translate('scenario.editor.exportFormat')}
      columns={2}
      label={translate('scenario.editor.format')}
      value={props.options.format}
      options={options}
      onChange={(format) => props.onChange(setScenarioDeckExportFormat(props.options, format))}
    />
  );
}
