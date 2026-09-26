import { createContext, useContext, useState, type ReactNode } from 'react';
import { Magnet } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { Translate } from '../../platform/i18n';
import type { GuideImageBlock } from '@sniptale/runtime-contracts/scenario/types/guide';

const Assistance = createContext({
  snap: true,
  boundedImage: null as string | null,
  setSnap: (_value: boolean) => {},
  setBoundedImage: (_value: string | null) => {},
});

/** Disposable editor preferences; accepted geometry remains in project history. */
export function GuideLayoutAssistance({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState(true);
  const [boundedImage, setBoundedImage] = useState<string | null>(null);
  return (
    <Assistance.Provider value={{ snap, setSnap, boundedImage, setBoundedImage }}>
      {children}
    </Assistance.Provider>
  );
}

export const useGuideLayoutAssistance = () => useContext(Assistance);

/** Bounds are an editing preference for one asset and block, never a stored image property. */
export function useGuideImageBounds(block: Pick<GuideImageBlock, 'id' | 'assetId'>) {
  const { boundedImage, setBoundedImage } = useGuideLayoutAssistance();
  const key = `${block.id}:${block.assetId}`;
  return {
    cropBounds: boundedImage === key,
    setCropBounds: (enabled: boolean) => setBoundedImage(enabled ? key : null),
  };
}

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
