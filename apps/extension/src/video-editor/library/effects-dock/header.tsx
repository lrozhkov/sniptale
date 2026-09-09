import type { EffectFileImportResult } from '../../../composition/persistence/effect-bundles/import-files';
import { EffectImportSummary } from '../../../ui/effect-catalog-controls';
import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';

import { translate } from '../../../platform/i18n';

export function EffectImportControl(props: {
  disabled: boolean;
  onImport(files: readonly File[]): Promise<EffectFileImportResult[]>;
  run(kind: 'import', action: () => Promise<unknown>): Promise<void>;
}): React.JSX.Element {
  const [results, setResults] = useState<EffectFileImportResult[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        multiple
        accept=".sniptale-bundle.zip,.sniptale-effect.json,application/zip,application/json"
        disabled={props.disabled}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (files.length)
            void props.run('import', async () => setResults(await props.onImport(files)));
        }}
      />
      <ProductActionButton
        disabled={props.disabled}
        tone="secondary"
        className="w-full justify-start"
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={16} aria-hidden="true" />
        {translate('videoEditor.effectsLibrary.importMany')}
      </ProductActionButton>
      <EffectImportSummary results={results} />
    </div>
  );
}
