# Native ENS indexer

Operator setup, environment variables, source isolation, Envio hosting and worker commands are maintained in [SETUP.md](../SETUP.md#discovery-database-indexer-and-worker). Current evidence and boundaries are in [AUDIT.md](../AUDIT.md).

This standalone package pins Envio 3.12.1 and native ENS ABI source `71a3b7339dbc55ab47667abdfe8303bac4f4c24e`. It has its own npm lockfile. Generated types and local dependencies are ignored.

- `src/handlers/`: dynamic native event journal and indexer checkpoint.
- `src/snapshot.ts`: canonical root-scoped reconstruction at a fixed block.
- `src/journal.ts`: optional Envio GraphQL candidate bridge.
- `src/export.ts` and `src/worker.ts`: finalized export and recurring atomic catalog sync.
- `src/fork.ts`: disposable native Anvil and PostgreSQL integration proof.

Search candidates always require fresh ENS resolution and Guard before signing. No global coverage, hosted deployment, or payment-volume attribution is implied.
