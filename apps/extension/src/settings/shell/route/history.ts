import { useCallback, useEffect, useState } from 'react';
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

export function useSettingsRoute() {
  const [route, setRoute] = useState<SettingsRoute>(initializeRouteFromLocation);

  useEffect(() => {
    const handlePopState = () => setRoute(initializeRouteFromLocation());
    globalThis.addEventListener('popstate', handlePopState);
    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((nextRoute: SettingsRoute) => {
    const nextUrl = buildSettingsRouteUrl(globalThis.location.href, nextRoute);
    globalThis.history.pushState(null, '', nextUrl);
    setRoute(nextRoute);
  }, []);

  return { navigate, route };
}
