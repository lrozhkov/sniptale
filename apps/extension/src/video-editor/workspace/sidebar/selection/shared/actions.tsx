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
  iconOnly = false,
  tone = 'secondary',
  ...props
}: ProductActionButtonProps & { separated?: boolean; iconOnly?: boolean }) {
  const button = (
    <ProductActionButton
      {...props}
      compact
      tone={tone}
      data-inspector-action="true"
      data-inspector-icon={iconOnly || undefined}
      data-inspector-tone={tone}
    />
  );
  return separated ? <InspectorActions>{button}</InspectorActions> : button;
}
