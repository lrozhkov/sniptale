import { createContext, useContext, useState, type ReactNode } from 'react';
import { Magnet } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { Translate } from '../../platform/i18n';
import type { GuideImageBlock } from '@sniptale/runtime-contracts/scenario/types/guide';

const Assistance = createContext({
  snap: true,
  unboundedImage: null as string | null,
  setSnap: (_value: boolean) => {},
  setUnboundedImage: (_value: string | null) => {},
});

/** Disposable editor preferences; accepted geometry remains in project history. */
export function GuideLayoutAssistance({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState(true);
  const [unboundedImage, setUnboundedImage] = useState<string | null>(null);
  return (
    <Assistance.Provider value={{ snap, setSnap, unboundedImage, setUnboundedImage }}>
      {children}
    </Assistance.Provider>
  );
}

export const useGuideLayoutAssistance = () => useContext(Assistance);

/** Bounds are an editing preference for one asset and block, never a stored image property. */
export function useGuideImageBounds(block: Pick<GuideImageBlock, 'id' | 'assetId'>) {
  const { unboundedImage, setUnboundedImage } = useGuideLayoutAssistance();
  const key = `${block.id}:${block.assetId}`;
  return {
    cropBounds: unboundedImage !== key,
    setCropBounds: (enabled: boolean) => setUnboundedImage(enabled ? null : key),
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
