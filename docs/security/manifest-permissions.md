# Manifest permissions

This document owns permission-design decisions. `tooling/configs/qa/manifest-permissions.data.json` owns the complete inventory. It covers grants, owners, routes, disclosures, failure behavior, content scripts, and web-accessible resources. The generated [project facts](../engineering/project-facts.md) project the current capability set.

## Authority rules

- Keep all-sites access optional. Do not add required host permissions.
- Use `activeTab` for work on the current tab that the user invokes.
- Register the compact HTTP/HTTPS shim only while optional all-sites access is effective.
- Inject the full content runtime through the page-access owner. Do not add a static source content script.
- Require a separate Settings opt-in, the optional `file:///` grant, and `extension.isAllowedFileSchemeAccess()` before local-file tooling is effective.
- If the matching grant or product opt-in is revoked, remove dynamic registrations that the owner created.
- Keep extension pages usable without host permissions.
- Before use, check optional capabilities at their owning browser or runtime seam.
- After `nativeMessaging` revocation, disconnect the native port before you accept further native work.
- Preserve browser-only behavior if an optional permission is absent, denied, or revoked.

## Resource and runtime rules

- Expose only the exact font files, inert `cursors/text.svg` cursor and recording permission frame that the machine inventory lists. Keep the cursor self-contained, without scripts, external references or animation. Use dynamic resource URLs for the cursor and permission frame.
- Expose `apps/extension/src/media-permission/index.html` only to HTTP/HTTPS pages. Do not expose its runtime bundle. This frame requests microphone or camera access after an explicit toolbar action.
- Do not use wildcard web-accessible-resource entries.
- Do not expose injected runtime bundles as web-accessible resources.
- Use `file:///*` only for the web-accessible-resource match. Keep `file:///` as the optional Chrome permission.
- Keep privileged work behind background-owned routes even if an entrypoint or manifest grant exists.
- Keep the effect runtime declarative and isolated from network and storage. Enforce its owner-contract input and execution limits.
- Share the offscreen document through its lifecycle owner. Require a user action in visible extension-owned UI before microphone access.
- Apply the Web Snapshot [network-egress policy](data-handling.md#network-egress).

The recording permission frame requests access for the extension, not the host site. Its dynamic resource URL can differ from the loaded extension origin. Content targets the canonical extension origin for bootstrap and explicit camera/microphone delegation. The frame returns results through one private `MessagePort`. It does not publish device labels or capability tokens to the host page.

Chrome shows the native permission prompt without an additional pending card. The frame remains hidden during the request and after success. Only a failure makes its error card visible.

Background admits this exact child document only for `list-media-devices` with `requestPermission: false`. It requires the sender-owned tab and child frame/document metadata. The existing surface owner checks the complete lease, generations, epoch, recording identity and expiry. This exception permits no mutating command.

The frame retains its permission stream through countdown to preserve one-time access. Content releases it after recording acquires its sources, accepted disable, toolbar deactivation or disposal. Live enable releases its probe after the recording owner accepts the source. Recording completion releases remaining recording probes. Denial, cancellation or host policy failure leaves the requested device disabled. The UI reports failure without opening a tab or bypassing host policy.

## Permission changes

Change a grant and its inventory entry together. Before you remove a grant from the manifest, require the owner-seam gate, denial or fallback behavior, and regression proof.

Evaluate optional permissions independently. Do not infer optional status for `downloads`, `desktopCapture`, or `tabCapture` from another permission's request and failure handling.

The tour preview sandbox receives a bounded prepared guide or tour HTML Blob from its owning scenario frame. It has no privileged API or automatic network authority. The nested file retains its own hashed script CSP.

The shared manifest sandbox policy permits local inline content and data fonts for these files. The effect sandbox must retain its former restrictive effective CSP through a head meta. Check that CSP in release artifacts. Neither sandbox is web-accessible. Explicit tour URL actions may open parser-checked HTTP(S) destinations in a new tab with no opener.
