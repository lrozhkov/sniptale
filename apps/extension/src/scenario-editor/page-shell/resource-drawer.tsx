import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
} from 'react';
import { GuideImageResources } from './resources';
import { createPortal } from 'react-dom';
import { Image, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductModal } from '@sniptale/ui/product-modal';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import type { Translate } from '../../platform/i18n';

type ResourceDrawerProps = { children: ReactNode; t: Translate };
type ResourceTarget =
  | NonNullable<ComponentProps<typeof GuideImageResources>['target']>
  | { kind: 'steps' };
const ResourceRequest = createContext<((target: ResourceTarget) => void) | null>(null);

/** One drawer target and lifecycle serves both resource-inspector and document-slot triggers. */
export function GuideResourceDrawer({
  children,
  t,
  ...props
}: ResourceDrawerProps &
  Pick<ComponentProps<typeof GuideImageResources>, 'onImport' | 'disabled' | 'selectedStepId'>) {
  const [target, setTarget] = useState<ResourceTarget | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const theme = useResolvedPortalTheme(anchor.current);
  const close = useCallback(() => setTarget(null), []);
  return (
    <ResourceRequest.Provider value={setTarget}>
      <span ref={anchor} className="guide-resource-drawer-anchor" />
      {children}
      {target &&
        createPortal(
          <div data-theme={theme ?? undefined} className="sniptale-ai-modal-root">
            <GuideResourceDialog t={t} onClose={close}>
              <GuideImageResources
                {...props}
                t={t}
                {...(target.kind === 'replace-image' ? { target, onComplete: close } : {})}
              />
            </GuideResourceDialog>
          </div>,
          resolveThemeSafePortalTarget(anchor.current)
        )}
    </ResourceRequest.Provider>
  );
}

/** Opens the single runtime-local drawer with an optional exact image destination. */
export function GuideResourceTrigger({
  t,
  target,
  disabled = false,
  label = false,
  title,
}: {
  t: Translate;
  target?: ResourceTarget;
  disabled?: boolean;
  label?: boolean;
  title?: string;
}) {
  const request = useContext(ResourceRequest);
  const buttonProps = {
    type: 'button' as const,
    title: title ?? t('scenario.editor.guideOpenImageLibrary'),
    disabled: disabled || !request,
    'aria-controls': 'guide-resource-drawer',
    onClick: () => request?.(target ?? { kind: 'steps' }),
  };
  const icon = <Image size={16} aria-hidden="true" />;
  return label ? (
    <ProductActionButton {...buttonProps} tone="secondary" compact>
      {icon}
      {buttonProps.title}
    </ProductActionButton>
  ) : (
    <ContentToolbarButton {...buttonProps}>{icon}</ContentToolbarButton>
  );
}

function GuideResourceDialog({ onClose, ...props }: ResourceDrawerProps & { onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const step = previous?.closest<HTMLElement>('article');
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
      else if (step?.isConnected) step.focus();
    };
  }, []);
  return (
    <ProductModal
      onClose={onClose}
      width="min(1440px, calc(100vw - 32px))"
      maxWidth="100vw"
      maxHeight="100dvh"
      role="presentation"
      dialogClassName="guide-resource-drawer-surface"
      onKeyDown={(event) => {
        if (event.defaultPrevented) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return;
        }
        if (event.key !== 'Tab') return;
        const buttons = [
          ...(panel.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]'
          ) ?? []),
        ].filter((element) => element.getClientRects().length > 0 && !element.closest('[hidden]'));
        const first = buttons[0];
        const last = buttons.at(-1);
        if (!first) {
          event.preventDefault();
          panel.current?.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === panel.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <aside
        ref={panel}
        id="guide-resource-drawer"
        className="guide-resource-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={props.t('scenario.editor.guideResources')}
        tabIndex={-1}
      >
        <header className="guide-resource-drawer-heading">
          <h2>{props.t('scenario.editor.guideResources')}</h2>
          <ContentToolbarButton
            type="button"
            title={props.t('scenario.editor.close')}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </ContentToolbarButton>
        </header>
        <div className="guide-resource-drawer-body">
          <div>{props.children}</div>
        </div>
      </aside>
    </ProductModal>
  );
}
