import { EditorIconButton } from '@sniptale/ui/editor-chrome';
import { openSettingsPage } from '../../../platform/navigation/extension-pages';
import type { EffectFileImportResult } from '../../../composition/persistence/effect-bundles/import-files';
import { EffectImportSummary } from '../../../ui/effect-catalog-controls';
import { useRef, useState } from 'react';
import { Upload, Settings2 } from 'lucide-react';
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
      <div className="flex min-w-0 items-center gap-1">
        <ProductActionButton
          disabled={props.disabled}
          tone="secondary"
          className="min-w-0 flex-1 justify-start"
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={16} aria-hidden="true" />
          {translate('videoEditor.effectsLibrary.importMany')}
        </ProductActionButton>
        <EditorIconButton
          title={translate('settings.navigation.videoEffects')}
          onClick={() => void openSettingsPage({ route: { section: 'video-effects' } })}
        >
          <Settings2 size={16} aria-hidden="true" />
        </EditorIconButton>
      </div>
      <EffectImportSummary results={results} />
    </div>
  );
}
