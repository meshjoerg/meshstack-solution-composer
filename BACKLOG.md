# Solution Composer Backlog

This file captures product experiments and open implementation work that should remain visible while the prototype evolves. The README contains the detailed product model and design decisions.

## Current prototype sequence

The next implementation sequence should stay deliberately end-to-end and demo-oriented:

1. **Working Git repository integration** — save/reopen/version a Solution Blueprint and its generated artifacts.
2. **meshStack integration** — import Building Block Definitions/context and export the resulting composite Building Block.
3. **Solution Value Sets** — represent a concrete parameter set for one use of a reusable Solution Blueprint in an implementation-agnostic way.
4. **Private Hub** — publish a finished Solution as a reusable Building Block and consume it again from the Catalog.
5. **AI support** — architecture description and Solution Prompt experiments, grounded in the real connected Catalog.

AI deliberately comes **after the Private Hub experiment**. The more important product hypothesis to validate first is the recursive System Integrator workflow: compose reusable delivery IP, version it, publish it, and reuse it.

## Solution Blueprint vs. concrete Solution Value Set

The Composer creates a **Solution Blueprint**: the reusable architecture, parameter schema and wiring of a composite Building Block. It must be possible to apply the same Blueprint multiple times with different concrete parameter values.

We therefore need a separate concept for a **concrete parameter set**. This is analogous to a `tfvars` file for Terraform/OpenTofu, but must remain implementation-agnostic because a Solution may contain Building Blocks implemented with OpenTofu, pipelines, APIs or other mechanisms.

Working name: **Solution Value Set** (name can still change).

Conceptually:

```text
Solution Blueprint
  defines architecture + inputs + defaults + bindings

        +

Solution Value Set
  supplies concrete values for one customer/order/environment

        ↓

Concrete Solution Instance / delivery
```

A Value Set should:

- reference the Blueprint and ideally a specific Blueprint version;
- contain values only for parameters exposed by the composite Solution interface;
- support a human-readable name such as `customer-a-prod`;
- optionally carry delivery metadata such as customer number, order/contract number or environment;
- distinguish sensitive values from normal values;
- be reusable/editable independently of the Blueprint;
- be persistable/versionable where appropriate;
- be convertible by adapters into implementation-specific runtime representations, e.g. Terraform/OpenTofu `.tfvars`, meshStack BBD/BB input payloads, pipeline variables, etc.;
- never force implementation-specific concepts such as `.tfvars` into the canonical Composer model.

The generator/adapters therefore work in two layers:

1. **Blueprint generation** creates the reusable composite Building Block definition/code.
2. **Value Set rendering** maps a concrete parameter set into whatever the selected execution target requires.

Open questions to validate in the prototype:

- canonical JSON/YAML schema for a Value Set;
- whether Value Sets live in the same Git repository as the Blueprint or in a separate customer/delivery repository;
- how secrets are represented (references vs. persisted values; plaintext secrets should not be committed by default);
- how defaults from the Blueprint interact with omitted Value Set fields;
- how a Value Set references a Blueprint version when the Blueprint evolves;
- whether a Value Set ultimately maps to a meshStack Building Block instance/order rather than being stored as a first-class meshStack object;
- naming for the resulting concrete execution object: Solution Instance, Order, Deployment, Delivery, etc.

This distinction is important for the System Integrator scenario: the **Blueprint is reusable delivery IP**, while the **Value Set captures one concrete customer/order/environment configuration**.

## Demo connection configuration

Prototype controls should make it possible to configure and retain the external systems used for demos without rebuilding or editing source code.

Current/near-term connection concepts:

- **meshStack**: endpoint + API key
- **Working Git repository**: repository + branch + simple repository key/token
- **Private Hub**: endpoint + API key (optional until the API contract exists)

The prototype now has a sticky Config flyout for these connection values, including a quick-paste JSON mode so a complete demo configuration can be copied into the browser in one operation. The launcher also gives an immediate configured/not-configured indication for meshStack and Git.

Configuration remains separate from Blueprint metadata and generated Terraform/OpenTofu. For the prototype, local browser persistence in IndexedDB is sufficient; production-grade secret storage is explicitly out of scope.

The current flyout is configuration only. Follow-up work is to connect these settings to real adapters for:

- importing BBDs/context from meshStack;
- exporting the resulting composite BBD to meshStack;
- writing/versioning Solution code and Composer metadata in Git;
- loading custom Building Blocks from the working repository;
- reading/publishing Solutions and Building Blocks through the future Private Hub API.

## Private Hub experiment

The target model includes a Private Hub for proprietary/internal/partner-specific capabilities and **finished reusable Solutions**.

A System Integrator should be able to:

1. create a Solution Blueprint from reusable Building Blocks;
2. add customer-independent Solution metadata and Solution-level parameters;
3. version the result in Git;
4. publish the resulting composite Building Block into a Private Hub;
5. discover that Solution again in the Catalog;
6. reuse/customize it for another customer;
7. create a concrete Solution Value Set for the customer/order/environment without modifying the reusable Blueprint.

This is the central recursive product hypothesis: a composed Solution becomes another reusable Building Block in the integrator's cloud construction kit.

The current public Hub is effectively a **website/catalog overlay on top of a Git repository**. That is sufficient for the current prototype import experiment, but a real Composer/Private-Hub workflow will probably need a stable machine-facing API rather than relying on repository layout or website scraping.

The prototype should therefore be used to experiment with the required **Hub API contract**. Likely API capabilities include:

- list/search/filter catalog entries;
- retrieve canonical metadata and parameter schema;
- retrieve implementation/source references;
- publish a new Building Block / Solution;
- update metadata or publish a new version;
- deprecate/archive versions;
- distinguish public, private and organization-specific visibility;
- preserve provenance and source repository information.

Open architecture question: **Is Git the authoritative source of truth with the Hub API indexing/publishing Git-backed artifacts, or does the Hub become an independent registry with Git as one implementation/source?** The prototype should help answer this before the Private Hub model is hardened.

## AI-assisted solution engineering

AI support should be tested only after the connected Catalog / Private Hub flow is concrete enough to provide a meaningful capability boundary.

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

## Other high-priority backlog already established

- source toggles below the Building Block Catalog header for connected meshStack, public Hub, Private Hub and Git/custom;
- canonical source/provenance details and source URL tooltip for every Building Block;
- exact meshStack API integration for BBD import/export and context metadata;
- real Git persistence/versioning and reopen-from-Git workflow;
- stable Hub/Private-Hub API for read/search/publish/version/deprecate operations;
- publish a finished Solution as a reusable composite Building Block into a Private Hub;
- Solution tags and explicit custom Solution-level parameters (for example customer number, order/contract number, service tier, cost center);
- Solution Value Sets for concrete customer/order/environment parameterizations;
- implementation-specific renderers from Value Sets to `.tfvars`, meshStack input payloads, pipeline variables, etc.;
- required/optional metadata import and automatic promotion of unresolved required child inputs to composite Solution inputs;
- deterministic naming/collision handling for promoted inputs;
- correct executable meshStack Composition Terraform/OpenTofu generation;
- cycle prevention, type compatibility and invalid-reference validation;
- Blueprint lifecycle: New, Open, Save As, duplicate/fork;
- creation/import of Custom Building Blocks from Git;
- deployment/apply as a separate later workflow rather than an implicit Composer action.
