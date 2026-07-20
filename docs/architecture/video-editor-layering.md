# Video editor layering

The video editor keeps page-local dependencies in this direction:

```text
project + contracts
        ↑
interaction + state + runtime
        ↑
preview + timeline + library + export + chrome
        ↑
workspace
        ↑
shell
```

An owner may import another owner on the same row or a lower row. A lower owner must not import a higher row. `project` owns serializable project policy, `state` owns serializable editor state, and `runtime` adapts those contracts to sessions and effects. Product surfaces consume those lower owners, `workspace` composes the surfaces, and `shell` remains the page composition root.

The page-local `contracts` owner stays independent of React, Zustand, browser APIs, and product surfaces. Reusable video-editor chrome belongs to `chrome`, not `shell`; neutral formatting belongs to `contracts`, not a product surface.

`application`, `persistence`, `recording`, and `diagnostics` retain their existing explicit seams and are not part of this row-order rule.
