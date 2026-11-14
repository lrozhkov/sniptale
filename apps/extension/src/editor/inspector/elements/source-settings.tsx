import { useEffect, useRef, useState } from 'react';
import { ProductActionButton as ProductButton } from '@sniptale/ui/product-modal/actions';
import { CompactInput } from '../../chrome/ui';
import {
  useEditorVectorLibrarySession,
  useEditorVectorLibrarySnapshot,
} from '../../application/vector-elements/context';
import { translate } from '../../../platform/i18n';
const message = (
  key: keyof (typeof import('../../../platform/i18n/catalogs/en.json'))['editor']['elements']
) => translate(`editor.elements.${key}`);
export function EditorElementsSourceSettings() {
  const session = useEditorVectorLibrarySession(),
    state = useEditorVectorLibrarySnapshot();
  const [baseUrl, setBaseUrl] = useState(state.settings?.baseUrl ?? 'https://api.iconify.design/');
  const sourceEdited = useRef(false);
  useEffect(() => {
    if (!sourceEdited.current && state.settings) setBaseUrl(state.settings.baseUrl);
  }, [state.settings]);
  const [consent, setConsent] = useState(false);
  return (
    <section className="space-y-2">
      <h3 className="font-medium">{message('source')}</h3>
      <CompactInput
        aria-label={message('source')}
        value={baseUrl}
        onChange={(event) => {
          sourceEdited.current = true;
          setBaseUrl(event.target.value);
        }}
        disabled={state.busy}
        data-ui="editor.elements.source-url"
      />
      <p className="leading-5 text-[var(--sniptale-color-text-secondary)]">
        {message('networkDisclosure')}
      </p>
      <label className="flex items-start gap-2 leading-5">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          disabled={state.busy}
          data-ui="editor.elements.consent"
        />
        {message('consent')}
      </label>
      <div className="flex flex-wrap gap-2">
        <ProductButton
          tone="secondary"
          compact
          type="button"
          disabled={!consent || state.busy || !state.settings}
          onClick={() => void session.enableSource(baseUrl, consent)}
          data-ui="editor.elements.enable-network"
        >
          {message('enable')}
        </ProductButton>
        {state.settings?.networkEnabled ? (
          <ProductButton
            tone="secondary"
            compact
            type="button"
            disabled={state.busy}
            onClick={() => void session.saveSettings({ networkEnabled: false })}
          >
            {message('disable')}
          </ProductButton>
        ) : null}
        <ProductButton
          tone="secondary"
          compact
          type="button"
          disabled={!state.settings?.networkEnabled || state.busy}
          onClick={() => void session.checkConnection()}
          data-ui="editor.elements.check-source"
        >
          {message('testConnection')}
        </ProductButton>
      </div>
      {state.connected ? <p role="status">{message('connected')}</p> : null}
    </section>
  );
}
