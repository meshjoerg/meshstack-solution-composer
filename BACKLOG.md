# Solution Composer Backlog

This file captures product experiments and open implementation work that should remain visible while the prototype evolves. The README contains the detailed product model and design decisions.

## AI-assisted solution engineering

### AI architecture description

Use the actual composition and Building Block metadata as context so AI can improve the Solution metadata, especially the description.

Expected behavior:

- inspect the selected Building Blocks, their descriptions, inputs/outputs and dependencies;
- describe the resulting solution architecture in terms of the capabilities actually used;
- propose or rewrite the Solution description without inventing components that are not in the composition;
- optionally propose tags and a concise architecture summary for publishing to Git / Private Hub;
- keep the generated text editable and require an explicit user action before replacing user-authored metadata.

This should be useful for a System Integrator who has assembled the technical architecture and now wants a customer- or portfolio-ready explanation of what the Solution does.

### Solution Prompt / AI Composer experiment

Test a prompt-driven entry point where the user describes the customer solution they need in natural language and AI uses the available Building Block Catalog as its constrained capability set.

Example intent:

> Build me a sovereign application platform on STACKIT with a project, network, Kubernetes runtime and the required access controls.

Expected flow:

1. user enters the Solution Prompt;
2. AI searches/reasons over the currently enabled Building Block sources in the Catalog;
3. AI proposes a concrete architecture made only from available Building Blocks;
4. proposal explains why each Building Block is needed and identifies unresolved requirements;
5. user accepts/edits the proposal;
6. accepted Building Blocks are added to the Composer and dependencies/parameter bindings are proposed where confidence is sufficient;
7. anything uncertain remains explicitly unresolved instead of being silently guessed.

Important constraints for the experiment:

- the Catalog is the tool/capability boundary; AI should not hallucinate unavailable Building Blocks;
- provenance must remain visible (meshStack, public Hub, Private Hub, Git/custom);
- AI should distinguish architecture selection from parameter-value guessing;
- security/customer-specific values should not be fabricated;
- the result must remain a normal editable Composition, not a separate AI-only representation.

This is deliberately an experiment before making AI composition a core workflow.

## Demo connection configuration

Prototype controls should make it possible to configure and retain the external systems used for demos without rebuilding or editing source code.

Current/near-term connection concepts:

- **meshStack**: endpoint + API key
- **Working Git repository**: repository + branch + simple repository key/token
- **Private Hub**: endpoint + API key (optional until the API contract exists)

Configuration should be sticky across reloads and remain separate from Blueprint metadata and generated Terraform/OpenTofu. For the prototype, local browser persistence is sufficient; production-grade secret storage is explicitly out of scope.

The current flyout is configuration only. Follow-up work is to connect these settings to real adapters for:

- importing BBDs/context from meshStack;
- exporting the resulting composite BBD to meshStack;
- writing/versioning Solution code and Composer metadata in Git;
- loading custom Building Blocks from the working repository;
- reading/publishing Solutions and Building Blocks through the future Private Hub API.

## Other high-priority backlog already established

- source toggles below the Building Block Catalog header for connected meshStack, public Hub, Private Hub and Git/custom;
- canonical source/provenance details and source URL tooltip for every Building Block;
- exact meshStack API integration for BBD import/export and context metadata;
- real Git persistence/versioning and reopen-from-Git workflow;
- stable Hub/Private-Hub API for read/search/publish/version/deprecate operations;
- publish a finished Solution as a reusable composite Building Block into a Private Hub;
- Solution tags and explicit custom Solution-level parameters (for example customer number, order/contract number, service tier, cost center);
- required/optional metadata import and automatic promotion of unresolved required child inputs to composite Solution inputs;
- deterministic naming/collision handling for promoted inputs;
- correct executable meshStack Composition Terraform/OpenTofu generation;
- cycle prevention, type compatibility and invalid-reference validation;
- Blueprint lifecycle: New, Open, Save As, duplicate/fork;
- creation/import of Custom Building Blocks from Git;
- deployment/apply as a separate later workflow rather than an implicit Composer action.
