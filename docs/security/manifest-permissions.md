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

- Expose only the exact font files and inert `cursors/text.svg` recording cursor that the machine inventory lists. Keep the cursor self-contained, without scripts, external references or animation. Use a dynamic resource URL for that cursor.
- Do not use wildcard web-accessible-resource entries.
- Do not expose injected runtime bundles as web-accessible resources.
- Use `file:///*` only for the web-accessible-resource match. Keep `file:///` as the optional Chrome permission.
- Keep privileged work behind background-owned routes even if an entrypoint or manifest grant exists.
- Keep the effect runtime declarative and isolated from network and storage. Enforce its owner-contract input and execution limits.
- Share the offscreen document through its lifecycle owner. Require a user action in visible extension-owned UI before microphone access.
- Apply the Web Snapshot [network-egress policy](data-handling.md#network-egress).

## Permission changes

Change a grant and its inventory entry together. Before you remove a grant from the manifest, require the owner-seam gate, denial or fallback behavior, and regression proof.

Evaluate optional permissions independently. Do not infer optional status for `downloads`, `desktopCapture`, or `tabCapture` from another permission's request and failure handling.

The tour preview sandbox receives a bounded prepared guide or tour HTML Blob from its owning scenario frame. It has no privileged API or automatic network authority. The nested file retains its own hashed script CSP.

The shared manifest sandbox policy permits local inline content and data fonts for these files. The effect sandbox must retain its former restrictive effective CSP through a head meta. Check that CSP in release artifacts. Neither sandbox is web-accessible. Explicit tour URL actions may open parser-checked HTTP(S) destinations in a new tab with no opener.
