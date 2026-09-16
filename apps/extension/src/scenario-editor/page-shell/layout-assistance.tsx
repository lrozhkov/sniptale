import { createContext, useContext, useState, type ReactNode } from 'react';
import { Magnet } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { Translate } from '../../platform/i18n';

const Assistance = createContext({
  snap: true,
  cropBounds: false,
  setSnap: (_value: boolean) => {},
  setCropBounds: (_value: boolean) => {},
});

/** Disposable editor preferences; accepted geometry remains in project history. */
export function GuideLayoutAssistance({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState(true);
  const [cropBounds, setCropBounds] = useState(false);
  return (
    <Assistance.Provider value={{ snap, setSnap, cropBounds, setCropBounds }}>
      {children}
    </Assistance.Provider>
  );
}

export const useGuideLayoutAssistance = () => useContext(Assistance);

export function GuideSnapButton({ t, disabled }: { t: Translate; disabled: boolean }) {
  const { snap, setSnap } = useGuideLayoutAssistance();
  return (
    <ContentToolbarButton
      aria-label={t('scenario.editor.guideSnapLayout')}
      title={t('scenario.editor.guideSnapLayoutHint')}
      aria-pressed={snap}
      disabled={disabled}
      onClick={() => setSnap(!snap)}
    >
      <Magnet size={16} aria-hidden="true" />
    </ContentToolbarButton>
  );
}
