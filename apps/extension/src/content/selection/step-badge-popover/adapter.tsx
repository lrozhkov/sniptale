import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import { resolveContentPortalTarget } from '../interactive-frame/layout/portal';

export function StepBadgePopoverAdapter(props: {
  anchorEl: HTMLElement | null;
  children: React.ReactNode;
  detachedChildren?: React.ReactNode;
  getPopoverStyle: () => React.CSSProperties;
  isOpen: boolean;
  popoverRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <ContentPopoverAdapter
      isOpen={props.isOpen}
      anchorEl={props.anchorEl}
      portalTarget={resolveContentPortalTarget(props.anchorEl)}
      popoverRef={props.popoverRef}
      className={[
        'sniptale-step-badge-popover sniptale-glass-popover',
        'sniptale-content-popover--compact sniptale-content-popover--toolbar-menu',
      ].join(' ')}
      style={props.getPopoverStyle()}
      dataUi="content.step-badge.popover"
      {...(props.detachedChildren === undefined
        ? {}
        : { detachedChildren: props.detachedChildren })}
    >
      {props.children}
    </ContentPopoverAdapter>
  );
}
