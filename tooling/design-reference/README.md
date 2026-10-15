# Design reference tool

This local tool shows the active UI reference examples. [Canonical rules](../../docs/design/index.md) own the design contract. The tool reads those documents directly. It contains no copied rule documents.

## Run

From the repository root, run:

```sh
npm run design:reference
```

Open [the reference catalog](http://127.0.0.1:8780/tooling/design-reference/). Use `npm run design:reference -- --port 8781` to select another port. The server binds to 127.0.0.1. It serves only this tool, canonical design documents, and the local design entry. Development responses disable caching. Module loading and rule requests require HTTP.

## Boundaries

The examples establish visual and interaction references. They do not replace product state owners or specialized engines. The existing application component catalog demonstrates actual product components as migration proceeds. The external scene exercise and historical trials remain outside this tool. Agent-tooling packaging is a separate task.

Use the group catalog and its Rules tab. [Verification](../../docs/design/verification.md) defines visual and interaction proof.
