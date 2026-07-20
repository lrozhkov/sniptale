# Sniptale threat model

Owner: security architecture. Review when a privileged entrypoint, store, permission, network destination, import/export format, dependency admission rule, or release boundary changes.

## Assets

| ID | Asset | Objective |
| --- | --- | --- |
| DATA-SECRET | API keys, unlock material, authorization handles | Confidentiality and sender-bound use |
| DATA-CAPTURE | Page content, screenshots, media, projects | Confidentiality, integrity, user-controlled retention |
| DATA-PERSIST | Preferences, databases, backups, sync | Integrity, deletion, explicit authority |
| DATA-AI | Prompts, responses, provider configuration | Consent, minimization, redacted diagnostics |
| DATA-ARTIFACT | Dependencies, lockfile, build inputs, release artifact | Provenance and reproducibility |
| DATA-AUTHORITY | Browser and native privileges | Least privilege |
| DATA-DIAGNOSTICS | Diagnostics, traces, logs, erasure evidence | Redaction and deletion |
| DATA-ARCHIVE | Imported/exported archives and renderer inputs | Integrity and safe parsing |

Chromium APIs and the browser profile are trusted-computing-base assumptions, not confidential enclaves. Storage encryption and sender authorization reduce exposure but cannot protect against a compromised profile or extension runtime.

## Adversaries

Threats include malicious pages and frames, replayed or unauthorized senders, hostile archives/templates/renderers, compromised AI endpoints, unsafe DOM sinks, dependency/build compromise, hostile QA child processes or hooks, accidental retention, and local profile readers.

## Zones

| Zone | Inputs | Sensitive sinks |
| --- | --- | --- |
| PAGE / CONTENT | Hostile DOM in page and isolated worlds | Runtime messages, injected UI |
| EXTENSION / BACKGROUND | Extension pages and typed routes | Storage, tabs, debugger, capture, downloads, native messaging |
| OFFSCREEN / SANDBOX | Media and renderer payloads | Media processing and isolated evaluation |
| EXTERNAL / AI / NATIVE | Providers, native host, portable archives | Network egress, external process, import/export |
| LOCAL / SESSION / SYNC / IDB | Extension state | Persistent, ephemeral, replicated, and structured storage |
| CONTRIBUTOR / INSTALL / CI | Source, lock resolution, hooks, child output | Dependency admission and build inputs |
| RELEASE / DISTRIBUTION | Build inputs and verified legal closure | Reproducible artifact and distribution provenance |

## Invariants

| Threat | Invariant | Owner | Residual risk |
| --- | --- | --- | --- |
| Malformed, hostile, or replayed IPC | INV-IPC-AUTH | background route policy | Sender-classification defects |
| Injection or all-sites access exceeds intent | INV-PAGE-CAPABILITY | background/content authority | User-granted host access remains broad |
| Capture or diagnostics leak | INV-CAPTURE-RETENTION | capture/media owners | Profile access remains outside extension control |
| Hostile import crosses trust boundary | INV-IMPORT-PARSE | parser/import owners | User may retain malicious but valid content |
| AI secret or prompt leaves owner | INV-AI-SECRET-EGRESS | AI transport | Provider receives consented request data |
| Sync or backup defeats erasure | INV-PERSIST-ERASURE | persistence owners | External replicas require participant proof |
| Dependency or build input poisons evidence | INV-SUPPLY-CHAIN-PROVENANCE | QA/release owner | Local-machine compromise is out of scope |
| Sandbox execution escapes | INV-SANDBOX-ISOLATION | sandbox owner | Chromium sandbox is a TCB assumption |
| Hostile DOM reaches unsafe sink | INV-DOM-SANITIZATION | sanitizer owner | Sanitizer and browser rendering defects |
| Diagnostics retain sensitive data | INV-OBS-REDACTION | diagnostics owner | Existing user-controlled logs may persist |
| Manifest or artifact exceeds policy | INV-ARTIFACT-BOUNDARY | build/release owner | Distribution relies on the release builder |

The release invariant requires the production closure to be recomputed from the lockfile and installed tree, license exceptions to use checked-in version-tagged or commit-addressed bytes with an exact digest, bundled Manrope bytes to match their installed package sources and OFL text, and the archive legal payload to match policy digests. Ordinary validation remains offline.

## Review ownership

Security architecture reviews semantic changes to privileged entrypoints, permissions, storage, native/AI destinations, imports/exports, renderers, diagnostics, dependency admission, hooks, and release boundaries. Relocation alone does not change authority or invariants. This local release surface intentionally defines no `SECURITY.md`, hosted reporting channel, publication, or GitHub workflow.
