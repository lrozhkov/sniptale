import type { Dispatch, SetStateAction } from 'react';

import { translate } from '../../../../../platform/i18n';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { sanitizePresetPathInput } from '@sniptale/foundation/utils/preset-path';

export function SavePresetPathField(props: {
  path: string;
  setPath: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--sniptale-color-text-secondary)]">
        {translate('savePresets.editor.pathLabel')}
      </label>
      <div className="flex flex-wrap items-center gap-1">
        <span className="whitespace-nowrap text-xs text-[var(--sniptale-color-text-dim)]">
          {translate('savePresets.editor.downloadsPrefix')}
        </span>
        <ProductInput
          type="text"
          value={props.path}
          onChange={(event) => props.setPath(sanitizePresetPathInput(event.target.value))}
          className="min-w-[120px] flex-1 font-mono text-sm"
          placeholder={translate('savePresets.editor.pathPlaceholder')}
        />
        <span className="text-xs text-[var(--sniptale-color-text-dim)]">
          {translate('savePresets.editor.downloadsSuffix')}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--sniptale-color-text-dim)]">
        {translate('savePresets.editor.pathHint')}
      </p>
    </div>
  );
}
