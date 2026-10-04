import { createContext, useContext, useState, type ReactNode } from 'react';
import { Frame, Magnet } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { Translate } from '../../platform/i18n';
import type { GuideImageBlock } from '@sniptale/runtime-contracts/scenario/types/guide';

const Assistance = createContext({
  snap: true,
  showBoundaries: false,
  unboundedImage: null as string | null,
  setSnap: (_value: boolean) => {},
  setShowBoundaries: (_value: boolean) => {},
  setUnboundedImage: (_value: string | null) => {},
});

/** Disposable editor preferences; accepted geometry remains in project history. */
export function GuideLayoutAssistance({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState(true);
  const [showBoundaries, setShowBoundaries] = useState(false);
  const [unboundedImage, setUnboundedImage] = useState<string | null>(null);
  return (
    <Assistance.Provider
      value={{
        snap,
        setSnap,
        showBoundaries,
        setShowBoundaries,
        unboundedImage,
        setUnboundedImage,
      }}
    >
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

/** Reveals editing contours without changing document content or selection. */
export function GuideBoundariesButton({ t, disabled }: { t: Translate; disabled: boolean }) {
  const { showBoundaries, setShowBoundaries } = useGuideLayoutAssistance();
  return (
    <ContentToolbarButton
      aria-label={t('scenario.editor.guideShowBoundaries')}
      title={t('scenario.editor.guideShowBoundaries')}
      aria-pressed={showBoundaries}
      disabled={disabled}
      onClick={() => setShowBoundaries(!showBoundaries)}
    >
      <Frame size={16} aria-hidden="true" />
    </ContentToolbarButton>
  );
}
