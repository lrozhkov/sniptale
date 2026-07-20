import { ChevronDown, ChevronUp, Cpu } from 'lucide-react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';

import { translate } from '../../../../platform/i18n';
import { aiProvidersSectionCardClassName } from './constants';

interface AiProvidersPromptDisclosureProps {
  advancedOpen: boolean;
  children: ReactNode;
  setAdvancedOpen: Dispatch<SetStateAction<boolean>>;
  summary: string;
}

export function AIProvidersPromptDisclosure(props: AiProvidersPromptDisclosureProps) {
  return (
    <section className={aiProvidersSectionCardClassName}>
      <button
        type="button"
        className="flex w-full items-start justify-between gap-4 text-left"
        onClick={() => props.setAdvancedOpen((state) => !state)}
        aria-expanded={props.advancedOpen}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            <Cpu size={16} className="text-[var(--sniptale-color-success)]" />
            {translate('settings.aiProviders.globalPromptTitle')}
          </span>
          <span className="mt-1 block text-xs text-[var(--sniptale-color-text-dim)]">
            {props.summary}
          </span>
        </span>
        <span
          className={
            'flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ' +
            'text-[var(--sniptale-color-text-dim)]'
          }
        >
          {props.advancedOpen
            ? translate('settings.aiProviders.hideAdvanced')
            : translate('settings.aiProviders.showAdvanced')}
          {props.advancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {props.advancedOpen ? (
        <div className="mt-4 border-t border-[var(--sniptale-color-border-soft)] pt-4">
          {props.children}
        </div>
      ) : null}
    </section>
  );
}
