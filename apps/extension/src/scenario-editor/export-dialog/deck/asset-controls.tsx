import type { ScenarioDeckAssetMode } from '../../project/export/deck/types';
import { SegmentedRow } from '../../../ui/compact-inspector-controls';
import { translate } from '../../../platform/i18n';
import type { ScenarioDeckExportControlProps } from './types';

export function ScenarioDeckExportAssetControls(props: ScenarioDeckExportControlProps) {
  const markdown = props.options.format === 'markdown';
  const options: Array<{ label: string; value: ScenarioDeckAssetMode }> = [
    { label: translate('scenario.editor.exportEmbedImages'), value: 'embed' },
    { label: translate('scenario.editor.exportAssetsFolder'), value: 'files' },
  ];

  return (
    <div className="grid gap-2">
      <SegmentedRow
        ariaLabel={translate('scenario.editor.exportAssetMode')}
        columns={2}
        label={translate('scenario.editor.exportAssets')}
        value={props.options.assetMode}
        options={options.map((option) => ({
          ...option,
          disabled: markdown && option.value === 'embed',
        }))}
        onChange={(assetMode) => props.onChange({ ...props.options, assetMode })}
      />
      {markdown ? (
        <p className="px-3 text-xs text-[var(--sniptale-color-text-dim)]">
          {translate('scenario.editor.exportMarkdownBundleHint')}
        </p>
      ) : null}
    </div>
  );
}
