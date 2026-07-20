import type { CSSProperties, MutableRefObject, PropsWithChildren } from 'react';
import { mergeThemeScopedStyle } from '@sniptale/ui/theme/safe-portal';
import type { AppTheme } from '../theme/index';

interface GlassSelectMenuSurfaceProps extends PropsWithChildren {
  portal: boolean;
  portalTheme: AppTheme | null;
  portalStyle: CSSProperties;
  menuPosition: 'bottom' | 'top';
  menuSizeClasses: string;
  menuClassName: string;
  menuSurfaceClassName: string;
  menuRef: MutableRefObject<HTMLDivElement | null>;
}

function getGlassSelectMenuContainerClassName({
  portal,
  menuPosition,
  menuSurfaceClassName,
  menuSizeClasses,
  menuClassName,
}: Pick<
  GlassSelectMenuSurfaceProps,
  'portal' | 'menuPosition' | 'menuSurfaceClassName' | 'menuSizeClasses' | 'menuClassName'
>) {
  if (portal) {
    return [
      menuSurfaceClassName,
      'animate-glassSelectIn max-h-[min(18rem,calc(100vh-120px))] overflow-y-auto overscroll-contain',
      menuSizeClasses,
      menuClassName,
    ].join(' ');
  }

  const positionClassName = menuPosition === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';
  return [
    'absolute z-50 left-0 w-full',
    positionClassName,
    menuSurfaceClassName,
    'max-h-[16rem] overflow-y-auto overscroll-contain',
    'animate-glassSelectIn',
    menuSizeClasses,
    menuClassName,
  ].join(' ');
}

function getPortalSurfaceStyle(portalTheme: AppTheme | null, portalStyle: CSSProperties) {
  const isPositioned = portalStyle.top !== undefined && portalStyle.left !== undefined;
  const resolvedStyle: CSSProperties = isPositioned
    ? portalStyle
    : {
        ...portalStyle,
        visibility: 'hidden',
        pointerEvents: 'none',
      };

  return mergeThemeScopedStyle(portalTheme, resolvedStyle);
}

export function GlassSelectMenuSurface({
  portal,
  portalTheme,
  portalStyle,
  menuPosition,
  menuSizeClasses,
  menuClassName,
  menuSurfaceClassName,
  menuRef,
  children,
}: GlassSelectMenuSurfaceProps) {
  return (
    <div
      ref={menuRef}
      role="listbox"
      data-floating-ui-root="true"
      data-ui={portal ? 'shared.ui.glass-select.portal-surface' : 'shared.ui.glass-select.menu'}
      data-theme={portalTheme ?? undefined}
      style={portal ? getPortalSurfaceStyle(portalTheme, portalStyle) : undefined}
      className={getGlassSelectMenuContainerClassName({
        portal,
        menuPosition,
        menuSurfaceClassName,
        menuSizeClasses,
        menuClassName,
      })}
    >
      {children}
    </div>
  );
}
