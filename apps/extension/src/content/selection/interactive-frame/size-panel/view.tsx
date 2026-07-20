import { translate } from '../../../../platform/i18n';
import { ContentSizeTooltip } from '@sniptale/ui/content-size-tooltip';
import { MIN_FRAME_SIZE } from '../layout/portal';
import { InteractiveFrameSizePanelPortal } from './portal';
import type { SizePanelProps } from './types';
import { useInteractiveFrameSizePanelRenderState } from './render-state';

interface InteractiveFrameSizePanelContentProps {
  portalTheme: 'light' | 'dark' | null;
  sizePanelCoords: { x: number; y: number };
  handleSave: () => void;
  handleCancel: () => void;
  panelProps: SizePanelProps;
}

/** Renders the size panel body once editing visibility and portal theme are resolved. */
export function InteractiveFrameSizePanelContent({
  portalTheme,
  sizePanelCoords,
  handleSave,
  handleCancel,
  panelProps,
}: InteractiveFrameSizePanelContentProps) {
  const { viewModel } = useInteractiveFrameSizePanelRenderState(panelProps);

  return (
    <InteractiveFrameSizePanelPortal>
      <ContentSizeTooltip
        portalTheme={portalTheme}
        position={sizePanelCoords}
        widthValue={panelProps.tempFrame.width}
        widthMin={MIN_FRAME_SIZE}
        widthMax={viewModel.controls.maxWidth}
        heightValue={panelProps.tempFrame.height}
        heightMin={MIN_FRAME_SIZE}
        heightMax={viewModel.controls.maxHeight}
        maintainAspectRatio={panelProps.maintainAspectRatio}
        onWidthDecrease={() => viewModel.controls.adjustSize('width', -10)}
        onWidthIncrease={() => viewModel.controls.adjustSize('width', 10)}
        onHeightDecrease={() => viewModel.controls.adjustSize('height', -10)}
        onHeightIncrease={() => viewModel.controls.adjustSize('height', 10)}
        onWidthChangeRaw={viewModel.controls.handleWidthChangeRaw}
        onWidthChangeCommit={viewModel.controls.handleWidthChange}
        onHeightChangeRaw={viewModel.controls.handleHeightChangeRaw}
        onHeightChangeCommit={viewModel.controls.handleHeightChange}
        onToggleAspectRatio={viewModel.handleAspectRatioToggle}
        onCancel={handleCancel}
        onConfirm={handleSave}
        copy={{
          widthField: translate('content.overlayControls.widthField'),
          heightField: translate('content.overlayControls.heightField'),
          decreaseWidth: translate('content.overlayControls.decreaseWidth'),
          increaseWidth: translate('content.overlayControls.increaseWidth'),
          decreaseHeight: translate('content.overlayControls.decreaseHeight'),
          increaseHeight: translate('content.overlayControls.increaseHeight'),
          keepAspectRatio: translate('content.overlayControls.keepAspectRatioTitle'),
          cancel: translate('content.overlayControls.cancel'),
          confirm: translate('content.overlayControls.save'),
        }}
      />
    </InteractiveFrameSizePanelPortal>
  );
}
