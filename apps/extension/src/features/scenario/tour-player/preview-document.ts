import { SCENARIO_PREVIEW_MAX_BYTES } from './preview-contract';

// Immutable saved exports retain these exact previously bundled guide runtimes.
const retainedGuideRuntimeHashes = [
  'dzYMBa1Mh84duGVb11ECbGEj5Zso1ZXmoUwZj2Jp9fs=', // Before caption alignment (110c14f9a).
  'Om79Cdbfp0CYdQb8K01kOmAsY7YHTTtCrkrwSnNfFHo=', // Before viewer controls (2367c5e618).
];

// Exact retired Tour bundles; guide policy never admits them.
const retainedTourRuntimeHashes = [
  'wcvHun2bWRhYVo/KsSUC86BDTL0POnoKio273Y5dkb4=', // Before marker controls (3542f819).
  'Wzekv7b/kkq0XmPuhHgXIz8+9wALBHFuTqMr2mAuGfQ=', // Before stage backgrounds (4777f97e).
];

/** Runs only in the opaque sandbox: inert admission precedes mounting the original saved Blob. */
export async function admitSavedScenarioHtml(
  blob: Blob,
  mode: 'guide' | 'tour',
  scriptHash: string
) {
  if (
    !blob.size ||
    blob.size > SCENARIO_PREVIEW_MAX_BYTES ||
    !/^[A-Za-z0-9+/]{43}=$/u.test(scriptHash)
  )
    return false;
  const document = new DOMParser().parseFromString(await blob.text(), 'text/html');
  const policies = [...document.querySelectorAll('meta[http-equiv]')];
  if (
    policies.length !== 1 ||
    policies[0]?.getAttribute('http-equiv')?.toLowerCase() !== 'content-security-policy'
  )
    return false;
  const trustedHashes = [
    scriptHash,
    ...(mode === 'guide' ? retainedGuideRuntimeHashes : retainedTourRuntimeHashes),
  ];
  const admittedHash = trustedHashes.find((hash) => {
    const expectedPolicy =
      mode === 'guide'
        ? `default-src 'none'; script-src 'sha256-${hash}'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`
        : `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src data:; media-src data:; base-uri 'none'; form-action 'none'`;
    return policies[0]?.getAttribute('content') === expectedPolicy;
  });
  if (!admittedHash) return false;
  if (document.querySelector('base, iframe, frame, object, embed')) return false;
  for (const element of document.querySelectorAll('*')) {
    if (element.getAttributeNames().some((name) => /^on/iu.test(name))) return false;
    const rawHref = element.getAttribute('href');
    const href = rawHref ? [...rawHref].filter((char) => char.charCodeAt(0) > 32).join('') : '';
    if (
      href &&
      /^(?:javascript|data|blob|file|chrome|chrome-extension):/iu.test(href) &&
      element.tagName.toLowerCase() !== 'image'
    )
      return false;
  }
  const scripts = [...document.querySelectorAll('script')];
  const executable = scripts.filter((script) => script.getAttribute('type') !== 'application/json');
  if (executable.length !== 1 || executable[0]?.getAttributeNames().length) return false;
  const json = scripts.filter((script) => script.getAttribute('type') === 'application/json');
  if (mode === 'guide' ? json.length !== 0 : json.length !== 1 || json[0]?.id !== 'tour-data')
    return false;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(executable[0]?.textContent ?? '')
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest))) === admittedHash;
}
