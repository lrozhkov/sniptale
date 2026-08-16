import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildSettingsRouteUrl,
  resolveSettingsRoute,
  type SettingsRoute,
} from '../../../platform/navigation/extension-pages/settings-route/codec';

function initializeRouteFromLocation(): SettingsRoute {
  const resolution = resolveSettingsRoute(globalThis.location.href);
  if (resolution.shouldReplace) {
    globalThis.history.replaceState(null, '', resolution.normalizedUrl);
  }
  return resolution.route;
}

export function useSettingsRoute(options: { navigationBlocked?: boolean } = {}) {
  const [route, setRoute] = useState<SettingsRoute>(initializeRouteFromLocation);
  const routeRef = useRef(route);
  const navigationBlockedRef = useRef(options.navigationBlocked ?? false);
  routeRef.current = route;
  navigationBlockedRef.current = options.navigationBlocked ?? false;

  useEffect(() => {
    const handlePopState = () => {
      if (navigationBlockedRef.current) {
        globalThis.history.replaceState(
          null,
          '',
          buildSettingsRouteUrl(globalThis.location.href, routeRef.current)
        );
        return;
      }
      setRoute(initializeRouteFromLocation());
    };
    globalThis.addEventListener('popstate', handlePopState);
    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((nextRoute: SettingsRoute) => {
    if (navigationBlockedRef.current) return;
    const nextUrl = buildSettingsRouteUrl(globalThis.location.href, nextRoute);
    globalThis.history.pushState(null, '', nextUrl);
    setRoute(nextRoute);
  }, []);

  return { navigate, route };
}
