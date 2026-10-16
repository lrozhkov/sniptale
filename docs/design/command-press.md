# Command pressure and activation

[Buttons and commands](buttons.md) · [Foundations](foundations.md)

Pointer down shows pressure without executing. Hold retains feedback without repeating. Leaving clears pressure. Release outside does not execute. Returning while held restores native release-inside behavior. Release inside executes once. A canceled pointer press must not execute on later release. Disabled or pending commands cannot activate or show new pressure. Cancellation, lost capture, native dialogs, and window blur clear pressure.

Space executes on release. Escape cancels an armed Space. Enter executes once per physical press without key-repeat execution. Do not use aria-pressed for temporary physical pressure. Keep targets fixed. Move only content by 1px, with proposed 55ms down and 110ms release feedback. Do not wait for animation before executing. Reduced motion removes displacement, retaining visible pressure.

An established workspace shortcut can own a key before a focused command. Preserve this key routing. Apply the native command cycle only when the command receives the key. Open widgets and text editing retain their existing key owners.

Do not add ripple, bounce, hover lift, or ordinary command repeat. Numeric steppers retain their own repeat owner.
