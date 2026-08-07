import React from 'react';
import { ArrowDown, ArrowUp, Lock, Unlock } from 'lucide-react';
import {
  ProductGlassToolbarButton,
  ProductGlassToolbarDivider,
} from '@sniptale/ui/product-glass-toolbar';
import { translate } from '../../platform/i18n';

export function EditorFrameAnnotationLayerControls(props: {
  locked: boolean;
  onBringForward: () => void;
  onSendBackward: () => void;
  onToggleLock: () => void;
}) {
  const backwardLabel = translate('editor.toolbar.backwardLayer');
  const forwardLabel = translate('editor.toolbar.forwardLayer');
  const lockLabel = translate(
    props.locked ? 'editor.toolbar.unlockLayer' : 'editor.toolbar.lockLayer'
  );
  const action = (callback: () => void) => (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    callback();
  };
  return (
    <>
      <ProductGlassToolbarDivider />
      <ProductGlassToolbarButton
        aria-label={backwardLabel}
        onClick={action(props.onSendBackward)}
        title={backwardLabel}
      >
        <ArrowDown size={17} />
      </ProductGlassToolbarButton>
      <ProductGlassToolbarButton
        aria-label={forwardLabel}
        onClick={action(props.onBringForward)}
        title={forwardLabel}
      >
        <ArrowUp size={17} />
      </ProductGlassToolbarButton>
      <ProductGlassToolbarButton
        active={props.locked}
        aria-label={lockLabel}
        onClick={action(props.onToggleLock)}
        title={lockLabel}
      >
        {props.locked ? <Lock size={17} /> : <Unlock size={17} />}
      </ProductGlassToolbarButton>
    </>
  );
}
