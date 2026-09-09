import type { ReactNode } from 'react';
import {
  ProductActionButton,
  type ProductActionButtonProps,
} from '@sniptale/ui/product-modal/actions';

function InspectorActions({ children }: { children: ReactNode }) {
  return <div data-ui="video-editor.inspector.actions">{children}</div>;
}

export function InspectorActionButton({
  separated = false,
  tone = 'secondary',
  ...props
}: ProductActionButtonProps & { separated?: boolean }) {
  const button = (
    <ProductActionButton {...props} compact tone={tone} data-inspector-action="true" />
  );
  return separated ? <InspectorActions>{button}</InspectorActions> : button;
}
