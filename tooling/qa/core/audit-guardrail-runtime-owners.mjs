const AUTHORITY_HELPER_PATTERN =
  /\b(?:isExtensionPageSender|isPopupSender|isSettingsSender|isSnapshotViewerSender)\b/u;
const CAPABILITY_HELPER_PATTERN =
  /\b(?:isAuthorized.*Sender|authorize.*Sender|getUnauthorized.*SenderReason)\b/u;
const CAPABILITY_TOKEN_PATTERN = /\b(?:consume.*Capability|issue.*Capability)\b/u;

export function hasAuthoritativeSuccessResult(line) {
  return (
    /\b(?:result|status)\s*:/u.test(line) &&
    /\b(?:accepted|duplicate|blocked|failed|pending|cancelled|complete|completed|running|terminal)\b/u.test(
      line
    )
  );
}

export function isSuccessOnlyResponse(line) {
  const compactLine = line.replaceAll(/\s/gu, '');
  return (
    compactLine.includes('{success:true}') || compactLine.includes('sendResponse({success:true})')
  );
}

export function hasCanonicalAuthorityPredicate(source) {
  return (
    AUTHORITY_HELPER_PATTERN.test(source) ||
    CAPABILITY_HELPER_PATTERN.test(source) ||
    CAPABILITY_TOKEN_PATTERN.test(source)
  );
}

export function isAdHocSenderUrlAuthority(line) {
  const comparesGetUrl =
    line.includes('sender.url') && line.includes('getURL(') && /={2,3}|!={1,2}/u.test(line);
  const startsWithGetUrl =
    line.includes('sender.url') && line.includes('startsWith') && line.includes('getURL(');
  return comparesGetUrl || startsWithGetUrl;
}

export function isContractSchemaTarget(relativePath) {
  return (
    relativePath.startsWith('apps/extension/src/contracts/messaging/') ||
    relativePath.startsWith('packages/runtime-contracts/src/messaging/') ||
    relativePath.startsWith('apps/extension/src/workflows/media-hub-backup/') ||
    relativePath.startsWith('apps/extension/src/features/web-snapshot/') ||
    relativePath.startsWith('apps/extension/src/features/video/project/effect-bundle/') ||
    relativePath.startsWith('apps/extension/src/effect-runtime-sandbox/protocol/') ||
    relativePath.startsWith('packages/runtime-contracts/src/effect-v1/')
  );
}
