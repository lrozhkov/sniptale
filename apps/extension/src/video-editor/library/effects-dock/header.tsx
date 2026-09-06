import { useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';

import { translate } from '../../../platform/i18n';

export function EffectsLibraryHeader(props: {
  onClose(): void;
  action?: React.ReactNode;
  title?: React.ReactNode;
}): React.JSX.Element {
  return (
    <header
      className={[
        'flex h-[52px] shrink-0 items-center justify-between gap-2 border-b',
        'border-[color:var(--sniptale-color-border-soft)] px-3',
      ].join(' ')}
    >
      {props.title ?? (
        <h2
          className="min-w-0 flex-1 truncate text-[13px] font-semibold"
          title={translate('videoEditor.effectsLibrary.description')}
        >
          {translate('videoEditor.effectsLibrary.title')}
        </h2>
      )}
      {props.action}
      {!props.action && (
        <EditorIconButton
          className="!h-6 !w-6"
          title={translate('common.actions.close')}
          onClick={props.onClose}
        >
          <X size={14} strokeWidth={2} />
        </EditorIconButton>
      )}
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
