# Sniptale threat model

Review this model when a privileged entrypoint, store, permission, network destination, import or export format, dependency-admission rule, or release boundary changes.

## Trust assumptions

Chromium APIs and the browser profile are trusted computing base. Encryption and sender authorization do not protect a compromised profile or extension runtime.

The optional native companion, native-host registration, executable loading, code-signing enforcement, and operating system are outside this repository and extension artifact. The extension cannot attest a compromised local account, operating system, or replaced registered host.

Treat native messages as untrusted protocol input. Parse them through the native contract. Negotiate the protocol version. Enforce capability bounds. Bind each message to its request. Route effects through the native controller. Treat `signedBinary`, `rollbackProtected`, `notarized`, and `packageIntegrity` as self-reported compatibility fields, not cryptographic attestation.

## Threats and invariants

| Threat | Invariant | Owner | Residual risk |
| --- | --- | --- | --- |
| Malformed, hostile, or replayed IPC | `INV-IPC-AUTH` | background route policy | Sender-classification defects |
| Page injection or all-sites access exceeds intent | `INV-PAGE-CAPABILITY` | background and content authority | User-granted host access remains broad |
| Capture or diagnostics disclose content | `INV-CAPTURE-RETENTION` | capture, media, and diagnostics owners | Profile access and user-shared output |
| Hostile import crosses a trust boundary | `INV-IMPORT-PARSE` | parser and import owners | Valid content may still be malicious to its user |
| AI secret or prompt leaves its owner | `INV-AI-SECRET-EGRESS` | AI transport | Provider receives the consented request |
| Sync or backup defeats erasure | `INV-PERSIST-ERASURE` | persistence owners | External replicas need participant deletion proof |
| Dependency or build input poisons evidence | `INV-SUPPLY-CHAIN-PROVENANCE` | QA and release owners | Local-machine compromise |
| Sandbox execution escapes | `INV-SANDBOX-ISOLATION` | sandbox owner | Chromium sandbox defects |
| Hostile DOM reaches an unsafe sink | `INV-DOM-SANITIZATION` | sanitizer owner | Sanitizer or browser-rendering defects |
| Diagnostics retain sensitive data | `INV-OBS-REDACTION` | diagnostics owner | Previously exported user-controlled logs |
| Manifest or artifact exceeds policy | `INV-ARTIFACT-BOUNDARY` | build and release owners | Compromise of the admitted release builder |
| Native status is presented as attestation | `INV-NATIVE-TRUST` | native adapter and compatibility owner | A replaced registered host is indistinguishable |

The adversaries are malicious pages and frames, unauthorized or replayed senders, hostile archives and render inputs, compromised external endpoints, dependency or build compromise, hostile QA child processes or hooks, accidental retention, and local profile readers.

## Boundary map

| Zone | Untrusted input | Privileged or sensitive sink |
| --- | --- | --- |
| Page and content | DOM and page events | runtime messages and injected UI |
| Extension and background | extension pages and routed messages | storage, tabs, capture, downloads, and native messaging |
| Offscreen and sandbox | media and renderer payloads | media processing and isolated evaluation |
| External systems | AI providers, native host, and portable archives | network egress, external process, and import/export |
| Persistence | local, session, sync, IndexedDB, and OPFS values | durable, replicated, or ephemeral state |
| Contributor and CI | source, dependency hooks, and child output | build inputs and proof |
| Release | admitted build inputs and legal closure | artifact and public distribution |

## Supply-chain boundary

Treat pull-request source, dependency hooks, candidate QA controls, and candidate-built image contents as untrusted. Candidate execution must not receive repository tokens, cloud credentials, OIDC authority, or write access to the trusted mount.

Proof admission must bind evidence to the candidate and preserve the trusted-control boundary. Canonical candidate-admission and proof-reuse rules belong to [Canonical CI/CD](../tooling/ci-cd.md).

Legal closure belongs to [OSS provenance](../oss/provenance.md). Publication admission belongs to the [release runbook](../oss/release.md).

## Review ownership

Security architecture reviews semantic changes to the triggers listed at the top of this document. A relocation that preserves authority and invariants does not require threat-model changes.

The current reporting and GitHub release facts are projected in the [generated project facts](../engineering/project-facts.md). Confidential reporting instructions belong to [SECURITY.md](../../.github/SECURITY.md).
