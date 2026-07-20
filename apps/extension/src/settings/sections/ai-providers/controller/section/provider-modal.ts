import { useState } from 'react';
import type { AIProvider } from '../../../../../contracts/settings';

type ProviderModalState = { open: boolean; provider?: AIProvider | null };

type ProviderModalController = {
  closeProviderModal: () => void;
  openProviderModal: (provider?: AIProvider) => void;
  providerModal: ProviderModalState;
};

export function useProviderModalState(): ProviderModalController {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<AIProvider | null>(null);

  return {
    closeProviderModal: () => {
      setProvider(null);
      setOpen(false);
    },
    openProviderModal: (nextProvider?: AIProvider) => {
      setProvider(nextProvider ?? null);
      setOpen(true);
    },
    providerModal: open ? { open: true, provider } : { open: false },
  };
}
