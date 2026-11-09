# Terminology cleanup and Biome

The follow-up applies the remaining readability feedback and adds a CI quality gate.

- parseConfirmationDelay and confirmationDelay now share one term. CONFIRMATION_DELAY, default 2, accepted range and persisted scope remain unchanged.
- The 404 message is now "Escrow was not found in the indexed blocks." OpenAPI examples/descriptions and the API guide use the same terminology. A structural comparison against HEAD confirmed only prose and that requested message changed in OpenAPI; fields, codes and validation rules are unchanged. Real HTTP acceptance asserts the message.
- Removed server re-exports and the unused readEscrows trace parameter. isMissingTableError owns PostgreSQL's 42P01 classification. A new regression verifies missing checkpoint tables leave database reachability up in both the snapshot and early-RPC-failure health paths.
- Biome 2.6.6 is an exact development dependency. The dedicated quality CI job installs the lockfile and runs lint:ci without writing; warnings fail the gate. lint and lint:fix provide local check/safe-fix paths. The configured TS/project-JSON scope excludes dependencies, generated files and historical AI records.
- The recommended preset allows explicit non-null assertions; dynamic JSON any is restricted to test/schema drivers. Guarded cleanup throws and bigint Math.min false positives have local explanations. Runtime RPC fallback types now use unknown. Formatting/import ordering and small lint fixes were applied across the configured scope; no unsafe autofix command was used.

Verification passed locally: Biome (38 files, no diagnostics), root/indexer types, 28 units, OpenAPI validation, 18 real indexer/HTTP observations, 10 Docker checks, foundation smoke/failure/cleanup, 62 contract tests and NatSpec/reference generation (98 targets). Temporary probes independently proved CI rejects formatting and lint violations; the probe driver first needed ANSI stripped from the CLI's JSON output. All temporary probes and owned test resources were removed.

The workflow structure was checked locally; its new remote run is not yet observed. No additional Claude consultation was invoked for this follow-up. Earlier reviews remain evidence for the previous snapshot, not approval of these additions. API refactoring, demo/supervision, Biome/CI and documentation are recorded in separate commits.

References: [Biome CI](https://biomejs.dev/recipes/continuous-integration/), [configuration](https://biomejs.dev/reference/configuration/).
