# Desktop connection protocol

## Ownership

Desktop owns native capture, recording controls, hotkeys, telemetry collection, save directories, and browser destination selection. Extension Settings owns the connection permission, installation consent, connection status, and trust revocation. The extension does not send settings snapshots or native capture commands in protocol v2. Settings import discards the retired `system.native` domain and preserves supported browser preferences. Browser navigation requests remain available on an authorized selected connection.

Desktop can retain multiple browser targets and one explicit default. Manual mode can show a destination dialog after capture. The dialog offers local storage and trusted browser targets. Cancellation preserves the captured material. Recording requires an explicitly configured default local directory, including when the planned destination is a browser.

## Connection and trust

Both peers require protocol version 2. The extension advertises `desktop-settings-v1` and `durable-media-ack-v1` in `extension.hello.capabilities`. `extension.hello.connectionIntent` identifies an automatic connection or an explicit user request. Desktop preserves its intentional-exit state and refuses automatic application startup after Quit. An explicit connection action can request startup.

Desktop sends `settingsAuthority: 'desktop'` in `app.hello`. Its `appIdentity` contains `trustVersion: 1` and a `clientId` of 64 lowercase hexadecimal characters. Desktop derives `clientId` from its protected installation identity. Runtime `appInstanceId` does not establish persistent trust.

The extension requires explicit user consent before it pins the installation identity for the configured Native Messaging host. A different installation requires new consent. The pin remains after restart and stays outside settings exports. Revocation disconnects the current port before it removes the pin. Privacy erasure invalidates pending authority before storage cleanup.

The installed Native Messaging host remains the transport trust boundary. The pin compares the installation identity that this host presents. The pin does not authenticate an arbitrary remote process.

After consent, `extension.controller.acquire` registers a browser target. The extension does not request takeover from another browser. Desktop selects the destination and sends `app.controller.lease`. Each lease includes `selectionStatus`:

| Selection | Lease status | Media authority |
| --- | --- | --- |
| `selected` | `granted` | Current, unexpired connection only |
| `available` | `owned-by-other-profile` or `rejected` | None |
| `selection-required` | `rejected` | None |

Desktop renews a selected lease before expiry. A renewal can retain its ID on the same connection. Reconnect or a new selection requires a new lease ID. Revocation must reach the former target before another target can receive its capture. The extension rejects stale connection identities and expired leases before side effects.

A host has 45 seconds to send a compatible hello. This budget includes native consent and bounded application startup. After registration starts, it has 15 seconds to return a lease decision. User consent has its own visible state and no registration deadline. Heartbeat messages run every 15 seconds. The extension reconnects after heartbeat silence exceeds 45 seconds.

Unexpected port closure permits five reconnect attempts with delays of 1, 2, 5, 10, and 30 seconds. `app.connection.closed` with `reason: 'user-quit'` stops automatic reconnect. Session storage preserves this pause across MV3 restarts. An explicit connection action removes the pause. Settings observes runtime status while its connection section remains open.

Desktop sends `app.settings.accepted` as a read-only status snapshot after granting a selected lease. The extension accepts this snapshot only on its current authorized lease. No pending extension settings revision participates in this operation.

## Media durability

The extension checks all chunks and the complete SHA-256 digest before publication. It saves the media and the transfer completion record before it sends ACK. The ACK includes `receipt: { durable: true, sha256, totalBytes }`. The receipt describes the verified saved source. Opening an editor is optional and cannot invalidate saved media.

Desktop accepts ACK only for the expected transfer and current lease. It compares receipt size and digest with the retained source. Timeout, disconnect, rejection, malformed receipt, or mismatched receipt never permits deletion of the only copy. Desktop retains the source and saves it in the configured local directory after uncertain delivery. A duplicate rejection does not prove durable receipt.

## Telemetry

Desktop sends active media milliseconds after it removes paused intervals. This rule covers event times and durations, cursor samples, and signal intervals. The extension converts these values to seconds once. It does not subtract the monotonic origin again.

Capture source region origins use signed 32-bit desktop pixels. Cursor and click coordinates must use the recorded frame's coordinate space. Window and region captures must exclude the virtual desktop origin. Viewport dimensions and DPR must describe that same space. Desktop e2e-lab checks the producer through the imported video and its review overlays.

## Proof boundary

Extension tests cover trust, lifecycle, authorization, parsing, durable receipts, and the connection interface. The browser UI spec uses controlled native runtime responses. It does not prove real Native Messaging transport. Desktop e2e-lab owns full transport, restart, destination selection, local fallback, and producer compatibility proof against the delivered extension ZIP.
