import type { ScenarioDeckAssetMode } from '../../project/export/deck/types';
import { SegmentedRow } from '../../../ui/compact-inspector-controls';
import type { ScenarioDeckExportControlProps } from './types';

const ASSET_MODE_OPTIONS: Array<{ label: string; value: ScenarioDeckAssetMode }> = [
  { label: 'Embed images', value: 'embed' },
  { label: 'Assets folder', value: 'files' },
];

export function ScenarioDeckExportAssetControls(props: ScenarioDeckExportControlProps) {
  const markdown = props.options.format === 'markdown';

  return (
    <div className="grid gap-2">
      <SegmentedRow
        ariaLabel="Asset mode"
        columns={2}
        label="Assets"
        value={props.options.assetMode}
        options={ASSET_MODE_OPTIONS.map((option) => ({
          ...option,
          disabled: markdown && option.value === 'embed',
        }))}
        onChange={(assetMode) => props.onChange({ ...props.options, assetMode })}
      />
      {markdown ? (
        <p className="px-3 text-xs text-[var(--sniptale-color-text-dim)]">
          Markdown is exported as a portable ZIP with slide SVG previews and asset files.
        </p>
      ) : null}
    </div>
  );
}
