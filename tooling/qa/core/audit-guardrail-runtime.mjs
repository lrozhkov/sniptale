import { collectLineViolations, createViolation, lineNumber } from './audit-guardrail-shared.mjs';
import {
  hasAuthoritativeSuccessResult,
  hasCanonicalAuthorityPredicate,
  isAdHocSenderUrlAuthority,
  isContractSchemaTarget,
  isSuccessOnlyResponse,
} from './audit-guardrail-runtime-owners.mjs';
import {
  AUTHORITY_PREDICATE_MESSAGE,
  LIFECYCLE_RESULT_MESSAGE,
  NETWORK_FETCH_MESSAGE,
  OPTIONALITY_DRIFT_MESSAGE,
  RESPONSE_PRIVACY_MESSAGE,
  SCHEMA_CAST_MESSAGE,
} from './audit-guardrail-runtime.messages.mjs';

const SOURCE_RUNTIME_OWNER_PATTERN =
  /^(?:apps\/extension\/src\/contracts\/messaging|packages\/runtime-contracts\/src\/messaging)\//u;
const EXTENSION_RUNTIME_OWNER_PATTERN = new RegExp(
  '^apps/extension/src/' +
    '(?:background|camera-recorder|content|design-system|gallery|offscreen|' +
    'popup|settings|web-snapshot-viewer)/',
  'u'
);
const RUNTIME_PROTOCOL_PATH_PATTERN = /^apps\/extension\/src\/(?:background|offscreen)\//u;
const RUNTIME_PROTOCOL_ROLE_PATTERN =
  /(?:runtime|routing|route|handler|quick-action|export|recording|control)/u;
const PRIVACY_FIELD_PATTERN = /\b(?:previewDataUrl|rawDiagnostics|rawHar|blob)\b/u;
const RESPONSE_PRIVACY_TARGET_PATTERNS = [
  /^apps\/extension\/src\/contracts\/messaging\/.*(?:response|runtime-message|schemas|types).*\.ts$/u,
  /^packages\/runtime-contracts\/src\/messaging\/.*(?:response|runtime-message|schemas|types).*\.ts$/u,
];
const REQUIRED_OPTIONALITY_TEST_PATTERN =
  /\b(?:optional|required|schema|parser|contract).*test\b/iu;
const NETWORK_FETCH_OWNER_PATTERN =
  /^apps\/extension\/src\/background\/(?:capture\/routing\/web-snapshot|media-hub\/web-snapshot)/u;
const FETCH_POLICY_HELPER_PATTERN =
  /\b(?:validateFetchUrl|authorizeWebSnapshotAssetFetch|isPrivateNetworkHost)\b/u;
const FETCH_POLICY_ASSERT_PATTERN =
  /\b(?:assert.*FetchPolicy|resolve.*FetchPolicy|validate.*Network.*Url)\b/u;

function isRuntimeOwnerPath(relativePath) {
  return (
    SOURCE_RUNTIME_OWNER_PATTERN.test(relativePath) ||
    EXTENSION_RUNTIME_OWNER_PATTERN.test(relativePath)
  );
}

function definesRequiredSchemaProperty(line, property) {
  return (
    (line.includes(`${property}: z.`) || line.includes(`${property}:z.`)) &&
    !/\.optional\s*\(/u.test(line)
  );
}

export function collectRuntimeProtocolContractViolations(files) {
  return collectLineViolations(files, ({ lines, relativePath, source }) => {
    if (!isRuntimeOwnerPath(relativePath)) {
      return [];
    }
    const violations = [];
    const isLifecycleRuntimeFile =
      RUNTIME_PROTOCOL_PATH_PATTERN.test(relativePath) &&
      RUNTIME_PROTOCOL_ROLE_PATTERN.test(relativePath) &&
      /\b(?:start|stop|cancel|export|quick[-A-Z_a-z]*action|recording)\b/iu.test(source);

    if (isLifecycleRuntimeFile) {
      lines.forEach((line, index) => {
        if (isSuccessOnlyResponse(line) && !hasAuthoritativeSuccessResult(line)) {
          violations.push(
            createViolation(
              'runtime-success-only-response',
              relativePath,
              lineNumber(index),
              LIFECYCLE_RESULT_MESSAGE
            )
          );
        }
      });
    }

    lines.forEach((line, index) => {
      if (isAdHocSenderUrlAuthority(line) && !hasCanonicalAuthorityPredicate(source)) {
        violations.push(
          createViolation(
            'runtime-authority-predicate-drift',
            relativePath,
            lineNumber(index),
            AUTHORITY_PREDICATE_MESSAGE
          )
        );
      }
    });

    return violations;
  });
}

export function collectRuntimeResponsePrivacyViolations(files) {
  return collectLineViolations(files, ({ lines, relativePath, source }) => {
    if (!RESPONSE_PRIVACY_TARGET_PATTERNS.some((pattern) => pattern.test(relativePath))) {
      return [];
    }
    const hasGate =
      /\b(?:capabilityToken|rawDiagnosticsEnabled|debug|download|capture|transfer)\b/u.test(
        source
      ) || /\b(?:dataUrlToBlob|WEB_SNAPSHOT_MAX_)\b/u.test(source);
    return lines.flatMap((line, index) => {
      if (!PRIVACY_FIELD_PATTERN.test(line) || hasGate) {
        return [];
      }
      return [
        createViolation(
          'runtime-response-sensitive-payload',
          relativePath,
          lineNumber(index),
          RESPONSE_PRIVACY_MESSAGE
        ),
      ];
    });
  });
}

function collectOptionalProperties(lines) {
  const properties = new Set();
  lines.forEach((line) => {
    const match = line.match(/\b([A-Za-z][A-Za-z0-9_]*)\??\s*:\s*[^,;]+/u);
    if (match && line.includes('?:')) {
      properties.add(match[1]);
    }
  });
  return properties;
}

export function collectContractOptionalityDriftViolations(files) {
  return collectLineViolations(files, ({ lines, relativePath, source }) => {
    if (!SOURCE_RUNTIME_OWNER_PATTERN.test(relativePath)) {
      return [];
    }
    const optionalProperties = collectOptionalProperties(lines);
    if (optionalProperties.size === 0 || !/\bz\./u.test(source)) {
      return [];
    }
    const violations = [];
    lines.forEach((line, index) => {
      for (const property of optionalProperties) {
        if (definesRequiredSchemaProperty(line, property)) {
          violations.push(
            createViolation(
              'contract-optionality-drift',
              relativePath,
              lineNumber(index),
              `Runtime message field "${property}" ${OPTIONALITY_DRIFT_MESSAGE}`
            )
          );
        }
      }
    });
    return REQUIRED_OPTIONALITY_TEST_PATTERN.test(source) ? [] : violations;
  });
}

export function collectMessagingSchemaCastViolations(files) {
  return collectLineViolations(files, ({ lines, relativePath }) => {
    if (!isContractSchemaTarget(relativePath)) {
      return [];
    }
    return lines.flatMap((line, index) => {
      const hasZodCast = /\bas\s+z\.ZodType\s*</u.test(line);
      const hasDomainCast =
        /\bas\s+unknown\s+as\s+(?:Runtime\w+|(?:Video|Scenario)\w+Project\w*)/u.test(line) ||
        /\bas\s+unknown\s+as\s+(?:WebSnapshot\w+|Backup\w+|TemplatePack\w+)/u.test(line) ||
        /\bas\s+unknown\s+as\s+.*(?:Message|Manifest|Metadata|Payload|Request|Response)/u.test(
          line
        );
      if (!hasZodCast && !hasDomainCast) {
        return [];
      }
      return [
        createViolation(
          'messaging-schema-boundary-cast',
          relativePath,
          lineNumber(index),
          SCHEMA_CAST_MESSAGE
        ),
      ];
    });
  });
}

export function collectNetworkFetchPolicyViolations(files) {
  return collectLineViolations(files, ({ lines, relativePath, source }) => {
    const hasPolicy =
      FETCH_POLICY_HELPER_PATTERN.test(source) || FETCH_POLICY_ASSERT_PATTERN.test(source);
    if (!NETWORK_FETCH_OWNER_PATTERN.test(relativePath) || hasPolicy) {
      return [];
    }
    return lines.flatMap((line, index) =>
      /\bfetch\s*\(/u.test(line)
        ? [
            createViolation(
              'network-fetch-policy-missing',
              relativePath,
              lineNumber(index),
              NETWORK_FETCH_MESSAGE
            ),
          ]
        : []
    );
  });
}
