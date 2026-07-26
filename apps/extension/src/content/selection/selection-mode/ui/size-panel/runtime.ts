import { syncContentSizeTooltipAspectRatioButtonState } from '@sniptale/ui/content-size-tooltip/dom';
import type { Selection } from '../../types';
import { MIN_SELECTION_SIZE } from '../../constants';
import type { SelectionModeSession } from '../../session';
import { applySelectionToolbarCompactButtonChrome } from '../final-elements/toolbar-chrome';
import {
  bindSelectionHeightInput,
  bindSelectionWidthInput,
  resizeSelectionHeight,
  resizeSelectionWidth,
} from './inputs';

type SizePanelSession = Pick<
  SelectionModeSession,
  'aspectRatio' | 'currentSelection' | 'dom' | 'maintainAspectRatio'
>;

interface SizePanelSetupArgs {
  constrainSelection: () => void;
  getMaxSelectionHeight: typeof import('../../constants').getMaxSelectionHeight;
  getMaxSelectionWidth: typeof import('../../constants').getMaxSelectionWidth;
  session: SizePanelSession;
  updateFinalFrame: () => void;
}

function createSelectionSync(args: SizePanelSetupArgs) {
  return (selection: Selection): void => {
    args.session.currentSelection = selection;
    args.constrainSelection();
    args.updateFinalFrame();
  };
}

function createAdjustSize(
  args: SizePanelSetupArgs,
  bounds: { maxHeight: number; maxWidth: number },
  syncSelection: (selection: Selection) => void
) {
  return (dimension: 'width' | 'height', delta: number): void => {
    const selection = { ...args.session.currentSelection };
    const resize = dimension === 'width' ? resizeSelectionWidth : resizeSelectionHeight;

    syncSelection(
      resize(selection, {
        delta,
        minSelectionSize: MIN_SELECTION_SIZE,
        maxWidth: bounds.maxWidth,
        maxHeight: bounds.maxHeight,
        maintainAspectRatio: args.session.maintainAspectRatio,
        aspectRatio: args.session.aspectRatio,
      })
    );
  };
}

function bindAdjustmentButtonGroup(
  selector: string,
  sizePanel: HTMLElement,
  delta: number,
  adjustSize: (dimension: 'width' | 'height', delta: number) => void
): void {
  sizePanel.querySelectorAll<HTMLElement>(selector).forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      adjustSize(button.dataset['target'] as 'width' | 'height', delta);
    });
  });
}

function bindAdjustmentButtons(
  sizePanel: HTMLElement,
  adjustSize: (dimension: 'width' | 'height', delta: number) => void
): void {
  bindAdjustmentButtonGroup('.sniptale-size-btn-minus', sizePanel, -10, adjustSize);
  bindAdjustmentButtonGroup('.sniptale-size-btn-plus', sizePanel, 10, adjustSize);
}

function bindAspectRatioToggle(button: HTMLButtonElement, session: SizePanelSession): void {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    session.maintainAspectRatio = !session.maintainAspectRatio;
    syncContentSizeTooltipAspectRatioButtonState(button, {
      maintainAspectRatio: session.maintainAspectRatio,
    });
    applySelectionToolbarCompactButtonChrome(button);

    const selection = session.currentSelection;
    if (session.maintainAspectRatio && selection.width > 0 && selection.height > 0) {
      session.aspectRatio = selection.width / selection.height;
    }
  });
}

function setupSizePanel(args: SizePanelSetupArgs): void {
  const { widthInput, heightInput, aspectRatioButton, sizePanel } = args.session.dom;
  if (!widthInput || !heightInput || !aspectRatioButton || !sizePanel) return;

  const bounds = {
    maxHeight: args.getMaxSelectionHeight(),
    maxWidth: args.getMaxSelectionWidth(),
  };
  const syncSelection = createSelectionSync(args);
  const adjustSize = createAdjustSize(args, bounds, syncSelection);
  const inputOptions = {
    minSelectionSize: MIN_SELECTION_SIZE,
    maxWidth: bounds.maxWidth,
    maxHeight: bounds.maxHeight,
    getCurrentSelection: () => args.session.currentSelection,
    getMaintainAspectRatio: () => args.session.maintainAspectRatio,
    getAspectRatio: () => args.session.aspectRatio,
  };

  bindAdjustmentButtons(sizePanel, adjustSize);
  bindSelectionWidthInput(widthInput, heightInput, syncSelection, inputOptions);
  bindSelectionHeightInput(heightInput, widthInput, syncSelection, inputOptions);
  bindAspectRatioToggle(aspectRatioButton, args.session);
}

export function createSelectionModeSizePanelSetup(args: SizePanelSetupArgs): () => void {
  return () => setupSizePanel(args);
}
