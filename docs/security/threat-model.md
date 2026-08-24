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

## Native companion trust boundary

The optional native companion is outside the extension artifact and this repository. Chrome's native-messaging host selection and the local operating system's native-host registration, executable loading, code-signing enforcement, and package distribution are trusted-computing-base assumptions. A compromised local account, replaced registered host, or compromised operating system is outside the extension's ability to attest.

Native messages remain untrusted protocol input and must pass the native contract parsers, version negotiation, controller ownership, capability bounds, and request correlation before they affect extension state. The `signedBinary`, `rollbackProtected`, `notarized`, and `packageIntegrity` install fields are self-reported by the connected host. They drive compatibility and repair guidance; they are not cryptographic proof verified by the extension, do not identify the executable with a pinned key, and must not be presented as an extension security verdict.

## Adversaries

Threats include malicious pages and frames, replayed or unauthorized senders, hostile archives/templates/renderers, compromised AI endpoints, unsafe DOM sinks, dependency/build compromise, hostile QA child processes or hooks, accidental retention, and local profile readers.

## Zones

| Zone | Inputs | Sensitive sinks |
| --- | --- | --- |
| PAGE / CONTENT | Hostile DOM in page and isolated worlds | Runtime messages, injected UI |
| EXTENSION / BACKGROUND | Extension pages and typed routes | Storage, tabs, capture, downloads, native messaging |
| OFFSCREEN / SANDBOX | Media and renderer payloads | Media processing and isolated evaluation |
| EXTERNAL / AI / NATIVE | Providers, native host, portable archives | Network egress, external process, import/export |
| LOCAL / SESSION / SYNC / IDB | Extension state | Persistent, ephemeral, replicated, and structured storage |
| CONTRIBUTOR / INSTALL / CI | Source, lock resolution, hooks, child output | Dependency admission and build inputs |
| RELEASE / DISTRIBUTION | Build inputs and verified legal closure | Reproducible artifact and distribution provenance |

GitHub Actions treats pull-request source and dependency hooks as untrusted. The required result is the default-branch `pull_request_target` job `pr-gate`. Trusted-base code admits exactly one graph: a candidate-bound derived-reuse proof with every VM job skipped, or locked-image execution with canonical proof, trusted admission, and successful cleanup. Sniptale intentionally permits a pull request to execute its candidate QA control implementation once. The trusted-base envelope verifies mandatory phase presence, candidate identity, proof schema, evidence hashes, execution compatibility, artifact closure, and final job-graph status, but does not independently re-execute the previous control implementation. QA-control changes therefore rely on normal human review and become canonical authority only after merge to `main`. This avoids a duplicate CI lane and a separate bootstrap merge for routine QA evolution.

Both candidate and trusted control digests are sealed into proof. A mismatch is reported as `QA controls changed` and `candidate-controls`; it is not itself a PR failure. Cross-digest proof reuse and documentation-only derived proof are forbidden. Release provenance is admissible only when the control digest is already the accepted digest on `main`. Candidate code never receives the workflow token, cloud credentials, OIDC authority, or write access to the trusted mount. The trusted runner host owns and records the mandatory phase schedule, overrides candidate image `ENTRYPOINT` and working-directory metadata for every phase, and performs final artifact collection and sealing. The executable filesystem inside a candidate-built QA image remains part of the candidate control implementation: it is not independently attested by the envelope and can weaken its own internal checks. This is the same deliberately accepted candidate-controls risk described above, not a claim that candidate Node, loader, or library bytes are trusted. The disposable VM pulls the public immutable QA image without a registry credential. Before the JIT runner starts, trusted bootstrap installs and verifies a Docker forwarding rule that rejects the OpenStack metadata address; a missing rule prevents candidate execution. External Actions are pinned to full commit SHAs. GitHub Releases must have repository-enforced immutability enabled before publication; the exact mutable draft receives and verifies the complete asset set before publication locks the tag and assets.

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
| Native host report is mistaken for attestation | INV-NATIVE-TRUST | native adapter and compatibility owner | A locally replaced registered host is indistinguishable to the extension |

The release invariant requires the production closure to be recomputed from the lockfile and installed tree, license exceptions to use checked-in version-tagged or commit-addressed bytes with an exact digest, bundled Manrope bytes to match their installed package sources and OFL text, and the archive legal payload to match policy digests. Ordinary validation remains offline.

## Review ownership

Security architecture reviews semantic changes to privileged entrypoints, permissions, storage, native/AI destinations, imports/exports, renderers, diagnostics, dependency admission, hooks, GitHub workflows, and release boundaries. Relocation alone does not change authority or invariants. GitHub is the canonical source and immutable release channel. The current confidential reporting mechanism is projected in the [generated project facts](../engineering/project-facts.md); disclosure instructions remain owned by [SECURITY.md](../../.github/SECURITY.md).
