# meshStack Solution Composer

Prototype for composing reusable meshStack solutions from Building Blocks.

The prototype explores a **Solution Blueprint / Composition Editor** for turning reusable Building Blocks into complete, reusable solutions. The intended result is itself a meshStack Building Block Definition that composes and manages other Building Blocks.

The core idea is:

**Hub / existing Building Blocks → Compose → resulting Solution Building Block → version in Git → publish/use in meshStack**

## Product model

A Solution is not a separate object beside Building Blocks. A Solution is itself a **composite Building Block** assembled from other Building Blocks.

This makes the model recursive:

- primitive Building Blocks
- reusable foundations
- platform / AI / infrastructure solutions
- industry solutions
- customer-specific solutions

The editor is therefore a **productization workbench** for modular standardization: reusable parts can be standardized while remaining composable into individual solutions.

## Design decisions made so far

### 1. Main workspace

The application uses two main areas:

- **Building Block Catalog** on the left
- **Solution Blueprint / Composition** on the right

The composition is the main working area. Contexts are shown **below the composition**, followed by the resulting Terraform/OpenTofu code.

### 2. Solution Blueprint metadata

A blueprint currently has:

- Name
- Identifier
- Description
- Working Git Repository
- Repository Path

The repository fields are intentionally already part of the model even though Git persistence is not implemented yet.

### 3. Building Block Catalog

Building Blocks are grouped by **platform** (AWS, Azure, STACKIT, Kubernetes, etc.). Platform groups can be folded.

Catalog entries preserve, where available:

- Building Block name
- short description
- platform logo / Building Block logo
- implementation technology
- input count
- output count
- source / provenance
- Official Integration marker

The catalog currently imports Building Blocks from the public `meshcloud/meshstack-hub` repository. The importer parses the Hub repository and creates a generated local catalog snapshot.

Catalog cards and Composer cards intentionally use the **same conceptual anatomy**:

1. source cap / provenance
2. Building Block identity (logo, name, description)
3. implementation technology + input/output counts
4. foldable parameter details

The catalog is compact by default; parameter details can be unfolded. The Composer opens newly added Building Blocks by default so that they can be configured immediately.

The `+` action in the catalog and the `×` action in the Composer are deliberately placed and styled as opposite operations: add capability vs. remove capability.

### 4. Building Block sources

The target catalog is not a single repository. It should merge Building Blocks from several sources into one view.

Planned sources are:

- **Connected meshStack** — Building Block Definitions available in the connected meshStack instance
- **meshStack Hub** — public/open ecosystem Building Blocks
- **Private Hub** — organization- or partner-specific reusable Building Blocks
- **Git / Custom Building Blocks** — Building Blocks maintained together with the solution portfolio in Git

Every catalog entry should retain its provenance. For the team demo, the source must be understandable at a glance, with a source cap and optionally a tooltip/details showing where the Building Block actually came from.

The catalog should also allow individual sources to be **enabled/disabled**. A first UI indication can be source toggle buttons / checkboxes directly below the Building Blocks catalog header.

### 5. Building Block implementation technology

Implementation technology is distinct from source/provenance.

Examples include:

- OpenTofu / Terraform
- GitHub Actions
- GitLab CI/CD
- Azure DevOps
- Manual Configuration

The implementation is represented primarily through a recognizable technology icon. It must not be inferred incorrectly: imported Building Blocks should use real metadata wherever possible.

### 6. Inputs, outputs and parameter semantics

Inputs and outputs are first-class parts of every Building Block.

Visual convention:

- `→ parameter` = input
- `↓ parameter` = output

Input parameters can be assigned to one of these sources:

- **Not assigned** — Composer draft state
- **meshStack Context Metadata**
- **Static value**
- **User input**
- **Platform Operator input**
- **Building Block output**

`Not assigned` is intentionally the Composer default. We do **not** assume that every imported input is automatically a User Input. The user explicitly decides where the value comes from.

Source-specific behavior:

- **Static value**: editable value is stored in the blueprint
- **User input**: supplied by the solution user at runtime; no static value field
- **Platform Operator input**: supplied by the platform operator at runtime; no static value field
- **meshStack Context**: select the relevant context metadata field
- **Building Block output**: select another Building Block instance and one of its outputs

If an imported OpenTofu variable has an implementation-level default, that should eventually be preserved as implementation metadata rather than silently converted into a User Input default.

### 7. Parameter editing

There are two complementary editing modes:

**Quick edit:** clicking an input parameter opens a small contextual editor at the parameter itself. It shows:

- parameter name
- data type
- short description
- source selection
- source-specific additional configuration

The popup closes when clicking outside it.

**Batch edit:** `EDIT INPUT PARAMETERS` unfolds the complete parameter list and allows all input bindings to be edited together. Large lists are scrollable.

Both views edit the same underlying binding state and must stay synchronized.

### 8. Context visualization

Contexts are shown below the Composition.

#### meshStack Context

Known meshStack context fields are visible as compact pills, currently including:

- Workspace Identifier
- Project Identifier
- Full Platform Identifier
- Platform Tenant ID
- meshStack Tenant UUID
- User Permissions
- Author
- Tags

#### Static Context

Only parameters explicitly assigned to `Static value` appear here. They are grouped by Building Block.

#### User / Operator Context

Only parameters explicitly assigned to User Input or Platform Operator Input appear here. They are grouped by Building Block; the Building Block name is normal text followed by parameter pills.

### 9. Color coding

Input assignments use a consistent source color language across parameter pills and context displays:

- meshStack Context — blue
- Static — amber
- User Input — green
- Platform Operator — violet
- Building Block Output — teal

The color communicates **where a value comes from**, not what technology implements the Building Block.

### 10. Composition and dependencies

Dependencies are derived from input bindings. If an input consumes another Building Block's output, that dependency becomes part of the composition graph automatically.

The editor deliberately avoids a free-form graph with many connector lines.

Current layout rules:

- independent/root Building Blocks start their own horizontal lanes
- a simple dependency chain continues horizontally
- dependent Building Blocks are placed after their predecessor
- for a merge with multiple predecessors, one predecessor is treated as the primary lane and additional dependencies are shown as additional dependency information

This keeps the composition readable without introducing a full graph editor.

When a new Building Block is added outside the current viewport, the view automatically scrolls to the new Composer card.

### 11. Persistence

A hard requirement for the prototype is:

**No work lost on reload.**

Blueprint state is autosaved locally in IndexedDB and the most recent blueprint is restored automatically.

Local autosave represents the **working state**. Git will later represent the **versioned/shared state**.

### 12. Generated code

The editor continuously shows the **resulting Solution Terraform/OpenTofu code**.

The intended output is not direct cloud infrastructure code. It is code for a **meshStack Composition Building Block** that creates/configures the selected Building Blocks and wires their inputs/outputs.

The exact generated meshStack provider/resources still need to be validated against the current meshStack Terraform/OpenTofu provider API before this output can be considered deployable.

## Target integration architecture

The intended flow is roughly:

```text
                        ┌────────────────────┐
                        │ Connected meshStack│
                        │ BBDs + Context     │
                        └─────────┬──────────┘
                                  │
┌───────────────┐                 │
│ meshStack Hub │─────────────────┤
└───────────────┘                 │
                                  ▼
┌───────────────┐        ┌───────────────────┐
│ Private Hub   │───────▶│ Building Block    │
└───────────────┘        │ Catalog           │
                         └─────────┬─────────┘
┌───────────────┐                  │
│ Git / Custom  │──────────────────┘
└───────────────┘                  │
                                   ▼
                         ┌───────────────────┐
                         │ Solution Composer │
                         └─────────┬─────────┘
                                   │
                 ┌─────────────────┴─────────────────┐
                 ▼                                   ▼
       ┌──────────────────┐               ┌──────────────────┐
       │ Git repository   │               │ meshStack        │
       │ versioned code   │               │ publish/import   │
       └──────────────────┘               └──────────────────┘
```

## Open requirements / next steps

The prototype intentionally leaves several product and integration questions open. These are the main items still to implement or decide.

### A. meshStack connection

Add a real meshStack connection configuration.

Minimum expected configuration:

- meshStack endpoint / instance
- API key / credential
- visible connection status
- enough instance/tenant information that a user understands which meshStack they are connected to

The credential must be treated as connection configuration, not as part of the solution blueprint or generated code.

The connected meshStack should serve three purposes:

1. **Import Building Block Definitions** into the catalog
2. **Import/resolve meshStack Context metadata** relevant to the editor
3. **Export/publish the resulting composite Building Block Definition** back into meshStack

Open questions:

- exact meshStack APIs to use for BBD import/export
- authentication and credential storage for the prototype
- how to select tenant/workspace/context when multiple scopes exist
- refresh/sync behavior and conflict handling
- whether imported BBD metadata should be cached locally

### B. Catalog source controls

Add a compact source-control area below the Building Blocks header.

At minimum it should make these sources visible and toggleable:

- Connected meshStack
- meshStack Hub
- Private Hub
- Git / Custom

For each source, show connection/availability state where meaningful.

Every Building Block should expose provenance, initially via source cap and tooltip/details. For a team demo, it must be obvious that the catalog is intended to **merge reusable capabilities from several supply sources into one portfolio**.

### C. Private Hub integration

The target model includes a Private Hub for proprietary/internal/partner-specific capabilities.

Still open:

- discovery/authentication model
- catalog metadata format
- distinction between private Hub and arbitrary Git-hosted custom Building Blocks
- publishing path from a composed/custom Building Block into the Private Hub

### D. Git integration

Connect the existing Working Repository / Repository Path fields to a real Git workflow.

The Git integration should support:

- persist generated solution code
- commit/version changes
- reopen an existing solution from Git
- maintain a portfolio of Solutions / composite Building Blocks
- add and maintain Custom Building Blocks alongside solutions
- preserve metadata required to reconstruct the Composer state

Likely follow-up decisions:

- branch strategy
- commit semantics (manual Save/Commit vs. automatic commits)
- repository layout for Solutions and custom Building Blocks
- whether generated code and Composer blueprint metadata live in the same directory
- pull/sync/conflict behavior

`backend/` currently exists as the intended adapter for local filesystem/Git operations but is not yet wired into the UI.

### E. Hub importer completeness

The current Hub importer is a prototype and needs to become more metadata-driven.

Open work includes:

- use canonical Hub title/description metadata consistently
- preserve official logos
- derive `Official Integration` from actual Hub metadata rather than prototype fallbacks
- support implementation technologies beyond the OpenTofu/Terraform structure
- preserve optional/default variable information
- preserve richer parameter metadata (types, sensitivity, optional/required, selections, etc.) where available
- provide a stable source URL/code link for every imported Building Block

### F. Exact meshStack Composition code generation

The generated Terraform/OpenTofu is currently a live conceptual output.

Before it becomes executable, validate and implement:

- exact current meshStack provider resources and schema
- correct representation of Building Block Definitions vs. Building Block instances
- Parent Building Block Output wiring
- meshStack Context Metadata bindings
- User Input / Platform Operator Input semantics
- output assignments (resource URL, sign-in URL, summary, platform tenant ID, etc.)
- optional/default variables
- sensitive values

### G. Dependency correctness

The UI derives dependencies from Building Block Output bindings, but graph correctness still needs hardening.

Open work:

- prevent dependency cycles when selecting outputs
- handle multiple predecessors explicitly and predictably
- decide whether additional dependency visualization is needed for multi-parent merges
- validate compatibility of connected output/input types
- surface unresolved or invalid references instead of silently producing invalid code

### H. Blueprint lifecycle

Local autosave exists, but explicit lifecycle actions are still open:

- New Blueprint
- Save / Save As
- Open Blueprint
- duplicate/fork Solution
- rename/move repository path
- distinguish local unsaved working state from last Git commit

### I. Custom Building Blocks

A placeholder for `+ New Building Block` exists in the catalog.

Future behavior should support creating or importing a custom Building Block, storing it in Git, and then using it exactly like Hub/meshStack Building Blocks in the Composer.

Open questions include:

- whether creation starts from Terraform/OpenTofu, pipeline code, or metadata first
- how inputs/outputs are inferred or declared
- how custom logos/metadata are stored
- how custom Building Blocks are promoted into a Private Hub or meshStack

### J. Deployment / execution

The current prototype composes and generates code; it does not deploy/apply the resulting solution.

Deployment/apply is intentionally separate from the current editing workflow. If added later, it should be a deliberate next step rather than turning the Composer into an implicit deployment tool.

## Current V1 boundaries

The following are intentionally **not** core to the current prototype unless promoted later:

- free-form graph editor
- automatic/AI composition
- automatic wiring based only on names
- direct cloud-resource provisioning from the browser
- full Private Hub administration
- production-grade Git conflict resolution
- production-grade secret management

## Architecture

- `frontend/` — Angular application and current composition logic
- `backend/` — lightweight FastAPI service reserved for filesystem, Git and integration adapters
- local IndexedDB — working-state persistence
- generated Hub catalog — current public Hub snapshot

The current prototype intentionally keeps most composition logic in the frontend. The backend is expected to become the adapter layer for Git, local files and authenticated external integrations such as meshStack.
