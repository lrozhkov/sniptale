export interface PageStyleRuntimePageIdentity {
  pageDomain: string | null;
  pageUrl: string;
}

function resolveCurrentLocation(): Pick<Location, 'href' | 'hostname'> {
  if (typeof window === 'undefined') {
    return { hostname: '', href: '' };
  }

  return window.location;
}

export function readPageStyleRuntimePageIdentity(
  locationLike: Pick<Location, 'href' | 'hostname'> = resolveCurrentLocation()
): PageStyleRuntimePageIdentity {
  return {
    pageDomain: locationLike.hostname || null,
    pageUrl: locationLike.href,
  };
}
