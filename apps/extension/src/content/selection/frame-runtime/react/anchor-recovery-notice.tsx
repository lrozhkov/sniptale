import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { FLOATING_INTERACTION_CAPTURE_TRANSIENT_ATTRIBUTE } from '@sniptale/ui/floating-interactions/ownership';
import { appendToContentOverlayRoot } from '../../../platform/dom-host';
import { applyIsolatedContentRootStyle } from '../../../platform/dom-host/isolated';
import { translate, useAppLocale } from '../../../../platform/i18n';
import type { FrameMutations } from '../contracts';
import type { FrameHostLayoutSnapshot } from '../host-layout/service';

export function AnchorRecoveryNotice(props: {
  snapshot: FrameHostLayoutSnapshot;
  onDelete(frameId: string): void;
  onPin(frameId: string): boolean;
}) {
  useAppLocale();
  const recovery = props.snapshot.recoveries[0];
  if (!recovery) return null;

  const messageKey =
    recovery.status === 'ambiguous'
      ? 'content.interactiveFrame.anchorAmbiguous'
      : 'content.interactiveFrame.anchorMissing';
  const counter = translate('content.interactiveFrame.anchorRecoveryCounter')
    .replace('{current}', '1')
    .replace('{total}', String(props.snapshot.recoveries.length));

  return (
    <div
      aria-live="polite"
      data-testid="anchor-recovery-notice"
      {...{ [FLOATING_INTERACTION_CAPTURE_TRANSIENT_ATTRIBUTE]: 'true' }}
      style={{
        alignItems: 'center',
        background: 'var(--sniptale-surface-elevated, #fff)',
        border: '1px solid var(--sniptale-border-subtle, #d8dee8)',
        borderRadius: 12,
        boxShadow: '0 12px 32px rgb(15 23 42 / 18%)',
        color: 'var(--sniptale-text-primary, #172033)',
        display: 'flex',
        flexWrap: 'wrap',
        fontFamily: 'var(--sniptale-font-family, system-ui, sans-serif)',
        gap: 8,
        maxWidth: 'min(680px, calc(100vw - 32px))',
        padding: '12px 14px',
        pointerEvents: 'auto',
      }}
    >
      <span style={{ flex: '1 1 260px', fontSize: 14 }}>
        {translate(messageKey)} <span aria-label={counter}>({counter})</span>
      </span>
      <ProductActionButton tone="secondary" onClick={() => props.onPin(recovery.frameId)}>
        {translate('content.interactiveFrame.anchorPin')}
      </ProductActionButton>
      <ProductActionButton tone="danger" onClick={() => props.onDelete(recovery.frameId)}>
        {translate('content.interactiveFrame.anchorDelete')}
      </ProductActionButton>
    </div>
  );
}

export function useAnchorRecoveryNotice(args: {
  mutations: Pick<FrameMutations, 'pinFrameAtLastPlacement' | 'removeFrame'>;
  snapshot: FrameHostLayoutSnapshot;
}) {
  const mutationsRef = useRef(args.mutations);
  mutationsRef.current = args.mutations;

  useEffect(() => {
    if (args.snapshot.recoveries.length === 0) return undefined;
    const container = document.createElement('div');
    container.className = 'sniptale-anchor-recovery-notice';
    container.setAttribute(FLOATING_INTERACTION_CAPTURE_TRANSIENT_ATTRIBUTE, 'true');
    applyIsolatedContentRootStyle(
      container,
      `
        position: fixed;
        left: 50%;
        bottom: 24px;
        transform: translateX(-50%);
        z-index: 2147483646;
        pointer-events: none;
      `
    );
    appendToContentOverlayRoot(container);
    const root = createRoot(container);
    root.render(
      <AnchorRecoveryNotice
        snapshot={args.snapshot}
        onDelete={(frameId) => mutationsRef.current.removeFrame(frameId)}
        onPin={(frameId) => mutationsRef.current.pinFrameAtLastPlacement(frameId)}
      />
    );
    return () => {
      root.unmount();
      container.remove();
    };
  }, [args.snapshot]);
}
