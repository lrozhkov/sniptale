import type { Dispatch, SetStateAction } from 'react';

import { translate } from '../../../../../platform/i18n';
import { ProductInput } from '@sniptale/ui/product-form-controls';

export function SavePresetNameField(props: {
  name: string;
  setName: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--sniptale-color-text-secondary)]">
        {translate('savePresets.editor.nameLabel')}
      </label>
      <ProductInput
        type="text"
        value={props.name}
        onChange={(event) => props.setName(event.target.value)}
        className="w-full"
        placeholder={translate('savePresets.editor.namePlaceholder')}
        maxLength={80}
      />
    </div>
  );
}
