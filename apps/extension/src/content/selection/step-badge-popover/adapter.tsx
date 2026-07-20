import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import { resolveContentPortalTarget } from '../interactive-frame/layout/portal';

export function StepBadgePopoverAdapter(props: {
  anchorEl: HTMLElement | null;
  children: React.ReactNode;
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
      className="sniptale-step-badge-popover sniptale-glass-popover"
      style={props.getPopoverStyle()}
      dataUi="content.step-badge.popover"
    >
      {props.children}
    </ContentPopoverAdapter>
  );
}
