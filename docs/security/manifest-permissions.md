# Manifest permissions

This document owns permission-design decisions. `tooling/configs/qa/manifest-permissions.data.json` owns the complete inventory of grants, owners, routes, disclosures, failure behavior, content scripts, and web-accessible resources. The generated [project facts](../engineering/project-facts.md) project the current capability set.

## Authority rules

- Keep all-sites access optional. Do not add required host permissions.
- Use `activeTab` for user-invoked current-tab work.
- Register the compact HTTP/HTTPS shim only while optional all-sites access is effective.
- Inject the full content runtime through the page-access owner. Do not add a static source content script.
- Require a separate Settings opt-in, the optional `file:///` grant, and `extension.isAllowedFileSchemeAccess()` before local-file tooling is effective.
- Remove owner-created dynamic registrations when the matching grant or product opt-in is revoked.
- Keep extension pages usable without host permissions.
- Check optional capabilities at their owning browser or runtime seam before use.
- Disconnect the native port before accepting further native work after `nativeMessaging` is revoked.
- Preserve browser-only behavior when an optional permission is absent, denied, or revoked.

## Resource and runtime rules

- Expose only the exact font files listed in the machine inventory.
- Do not use wildcard web-accessible-resource entries.
- Do not expose injected runtime bundles as web-accessible resources.
- Use `file:///*` only for the web-accessible-resource match. Keep `file:///` as the optional Chrome permission.
- Keep privileged work behind background-owned routes even when an entrypoint or manifest grant exists.
- Keep the effect runtime declarative and isolated from network and storage. Enforce its owner-contract input and execution limits.
- Share the offscreen document through its lifecycle owner. Require a user action in visible extension-owned UI before microphone access.
- Apply the Web Snapshot [network-egress policy](data-handling.md#network-egress).

## Permission changes

Change a grant and its inventory entry together. A grant reduction requires the owner-seam gate, denial or fallback behavior, and regression proof before removal from the manifest.

Evaluate optional permissions independently. Do not infer that `downloads`, `desktopCapture`, or `tabCapture` can be optional because another permission has request and failure handling.
