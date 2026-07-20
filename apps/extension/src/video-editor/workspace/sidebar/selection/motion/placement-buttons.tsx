import { ProductActionButton } from '@sniptale/ui/product-modal/actions';

export function MotionPlacementButtonGroup(props: {
  isPickingOnStage: boolean;
  onPick: () => void;
  onReset: () => void;
  pickLabel: string;
  resetLabel: string;
}) {
  return (
    <div className="space-y-2">
      <ProductActionButton
        compact
        tone="toggle"
        active={props.isPickingOnStage}
        aria-pressed={props.isPickingOnStage}
        className="w-full"
        onClick={props.onPick}
      >
        {props.pickLabel}
      </ProductActionButton>
      <ProductActionButton compact tone="secondary" className="w-full" onClick={props.onReset}>
        {props.resetLabel}
      </ProductActionButton>
    </div>
  );
}
