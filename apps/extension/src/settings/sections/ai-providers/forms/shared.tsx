import type React from 'react';

import { ProductModalBody } from '@sniptale/ui/product-modal';
import { settingsModalFieldSurfaceClassName } from '../../../section-surface/panel-controls';

const FORM_SUBMIT_ERROR_CLASS_NAME =
  'rounded-[12px] border border-[var(--sniptale-color-danger-border)] ' +
  'bg-[var(--sniptale-color-danger-soft)] px-3 py-2 text-sm text-[var(--sniptale-color-danger-text)]';

export function AiProvidersFormFieldSurface(props: { children: React.ReactNode }) {
  return <div className={settingsModalFieldSurfaceClassName}>{props.children}</div>;
}

export function AiProvidersFormModalBody(props: {
  children: React.ReactNode;
  onSubmit: (event: React.FormEvent) => void;
  submitError?: string;
}) {
  return (
    <ProductModalBody compact asForm onSubmit={props.onSubmit} className="space-y-3">
      {props.submitError ? (
        <div role="alert" className={FORM_SUBMIT_ERROR_CLASS_NAME}>
          {props.submitError}
        </div>
      ) : null}
      {props.children}
    </ProductModalBody>
  );
}
