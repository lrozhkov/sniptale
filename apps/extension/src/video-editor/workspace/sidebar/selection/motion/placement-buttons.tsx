import { ProductActionButton } from '@sniptale/ui/product-modal/actions';

export function MotionPlacementButtonGroup(props: {
  isPickingOnStage: boolean;
  onPick: () => void;
  onReset: () => void;
  pickLabel: string;
  resetLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <ProductActionButton
        compact
        tone="toggle"
        active={props.isPickingOnStage}
        aria-pressed={props.isPickingOnStage}
        onClick={props.onPick}
      >
        {props.pickLabel}
      </ProductActionButton>
      <ProductActionButton compact tone="secondary" onClick={props.onReset}>
        {props.resetLabel}
      </ProductActionButton>
    </div>
  );
}
