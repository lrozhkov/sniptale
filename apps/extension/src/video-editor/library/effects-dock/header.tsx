import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';

import { translate } from '../../../platform/i18n';

export function EffectImportControl(props: {
  disabled: boolean;
  onImport(file: File): Promise<void>;
  run(kind: 'import', action: () => Promise<unknown>): Promise<void>;
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".sniptale-bundle.zip,.sniptale-effect.json,application/zip,application/json"
        disabled={props.disabled}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void props.run('import', () => props.onImport(file));
        }}
      />
      <ProductActionButton
        disabled={props.disabled}
        tone="secondary"
        className="w-full justify-start"
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={16} aria-hidden="true" />
        {translate('videoEditor.effectsLibrary.importPack')}
      </ProductActionButton>
    </div>
  );
}
