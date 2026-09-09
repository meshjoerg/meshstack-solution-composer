# meshStack Solution Composer

Prototype for composing reusable meshStack solutions from Building Blocks.

## V1 scope

- Two-column UI: Building Block catalog on the left, Solution Blueprint on the right
- Sticky local blueprint state
- Context visualization for User, Static and meshStack context
- Building Block composition with inputs and outputs
- Input-to-output wiring and dependency visualization
- Live generated Terraform/OpenTofu composition preview
- Export-ready blueprint metadata

## Architecture

- `frontend/` Angular application
- `backend/` lightweight FastAPI service reserved for local Git/filesystem integration

The first prototype intentionally keeps all solution/composition logic in the frontend. The backend is only an adapter for local filesystem and Git operations later.
