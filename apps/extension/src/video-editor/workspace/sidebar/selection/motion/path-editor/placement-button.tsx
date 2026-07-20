import { ProductActionButton } from '@sniptale/ui/product-modal/actions';

export function MotionPathPlacementButton(props: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <ProductActionButton
      compact
      tone="toggle"
      active={props.active}
      aria-pressed={props.active}
      className="w-full"
      onClick={props.onClick}
    >
      {props.label}
    </ProductActionButton>
  );
}
