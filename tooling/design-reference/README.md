# Design reference tool

This local tool shows the active UI reference examples. [Canonical rules](../../docs/design/index.md) own the design contract. The tool reads those documents directly. It contains no copied rule documents.

## Run

From the repository root, run:

```sh
npm run design:reference
```

Open [the reference catalog](http://127.0.0.1:8780/tooling/design-reference/). Use `npm run design:reference -- --port 8781` to select another port. The server binds to 127.0.0.1. It serves only this tool, canonical design documents, the local design entry, and two canonical CSS files: `packages/ui/src/styles/design-tokens.css` and `packages/ui/src/styles/product-form-controls/range.css`. Other package files are not served. Development responses disable caching. Module loading and rule requests require HTTP.

## Boundaries

The examples establish visual and interaction references. They do not replace product state owners or specialized engines. This tool is the active sandbox. Do not add migration examples to the historical `apps/extension/src/design-system` catalog. The external scene exercise and historical trials remain outside this tool. Agent-tooling packaging is a separate task.

The Layers page contains the complete product color and gradient panels. Starting this server builds their reference adapter into the ignored `.generated` folder. Each panel uses an open Shadow DOM to isolate its product styles from the sandbox shell. The adapter retains canonical tokens, geometry, and interactions. Reference templates stay in memory. They do not change the extension's template catalog. The reference density preference uses a separate local key.

Use the group catalog and its Rules tab. [Verification](../../docs/design/verification.md) defines visual and interaction proof.

The [font owner](../../docs/design/fonts.md) defines the bundled families. The tool includes exact copies of their fonts and licenses: [Golos UI](assets/golos-ui-LICENSE.txt) and [Golos Text](assets/golos-text-LICENSE.txt).
