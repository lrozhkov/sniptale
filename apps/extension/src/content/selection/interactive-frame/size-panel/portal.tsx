import type React from 'react';
import { createPortal } from 'react-dom';
import { resolveContentPortalTarget } from '../layout/portal';

export function InteractiveFrameSizePanelPortal(props: { children: React.ReactNode }) {
  return createPortal(props.children, resolveContentPortalTarget());
}
