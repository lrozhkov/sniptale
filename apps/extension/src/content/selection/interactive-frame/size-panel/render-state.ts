import { useInteractiveFrameSizePanelViewModel } from './view-model';
import type { SizePanelProps } from './types';

export function useInteractiveFrameSizePanelRenderState(props: SizePanelProps) {
  return {
    portalTheme: null,
    viewModel: useInteractiveFrameSizePanelViewModel(props),
  };
}
