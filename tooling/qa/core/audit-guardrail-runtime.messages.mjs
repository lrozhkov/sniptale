export const LIFECYCLE_RESULT_MESSAGE =
  'Lifecycle runtime handlers must include an authoritative result/status, not bare success.';
export const AUTHORITY_PREDICATE_MESSAGE =
  'Popup/settings/viewer sender authority must use the canonical issue/consume predicate.';
export const RESPONSE_PRIVACY_MESSAGE =
  'Runtime responses need an explicit debug/transfer capability before raw payload fields.';
export const OPTIONALITY_DRIFT_MESSAGE =
  'is optional in its TS contract but required by the local schema; align both or add proof.';
export const SCHEMA_CAST_MESSAGE =
  'Messaging/manifest schemas need checked parser builders instead of boundary escape casts.';
export const NETWORK_FETCH_MESSAGE =
  'Privileged web-snapshot fetch owners must apply URL/private-network policy before fetch.';
