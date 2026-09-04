import { useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';

import { translate } from '../../../platform/i18n';

export function EffectsLibraryHeader(props: { onClose(): void }): React.JSX.Element {
  return (
    <header className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold">{translate('videoEditor.effectsLibrary.title')}</h2>
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.effectsLibrary.description')}
        </p>
      </div>
      <EditorIconButton title={translate('common.actions.close')} onClick={props.onClose}>
        <X size={16} strokeWidth={2} />
      </EditorIconButton>
    </header>
  );
}

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
        compact
        disabled={props.disabled}
        tone="secondary"
        className="w-full gap-2"
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={14} strokeWidth={2} />
        {translate('videoEditor.effectsLibrary.importPack')}
      </ProductActionButton>
    </div>
  );
}
