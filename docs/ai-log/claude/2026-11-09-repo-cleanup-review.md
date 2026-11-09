**No blocking problems.** The contract rules, Compose claims, API behaviour and schema descriptions I checked match the code. I ran no tests.

## 1. Documentation errors (all minor)

| Location | Problem | Smallest correction |
|---|---|---|
| `docs/api/README.md:17` | `/openapi.yaml` also returns 400 for any query (`domain.ts:62-64`), but only detail/health are named. | "detail/health/openapi.yaml accept no query parameters." |
| `docs/api/README.md:38` | Omits that data reads also need Ponder `/ready`, otherwise 503 (`server.ts:113-114`). | Add "engine readiness" to the verified list. |
| `README.md:78` | "role/time eligibility" implies a caller check, but the anonymous API uses only status and time (`domain.ts:113-119`). | "the sender's status/time eligibility" |
| `docs/postgres-models.md:39` | "installed by this diagram" makes no sense. | "The schema defines no foreign key." |
| `docs/sdd/escrow.md:18` | "this appendix structure" has no referent; this file isn't in the appendix. | "`docs/ai-log/`" |

## 2. Cuts

None of these hides a trade-off.

1. `docs/api/README.md:42`: drop "The old /observed facade is removed." It is history about a route current readers never saw.
2. `docs/postgres-models.md:3`: drop ", not the discarded polling design".
3. `README.md:96`: drop "local results are not a claim that an unpublished change passed remotely."
4. `docs/development.md:9,39-42`: remove the restart and reset commands duplicated from the README. Keep the warnings and link to it.
5. `docs/development.md:19`: drop the `--no-deps` clause, already explained at `README.md:22`.

## 3. Voice and navigation

**Voice: mostly yes.** "I interpret the cancellation window", "I chose Ponder" and "I assume honest…" read as the author's reasoning. It weakens where "I" is attached to system facts or reader steps:
- `README.md:14`: "I do not need host Node"
- `README.md:50`: "I have no owner withdrawal"
- `README.md:101`: "I have no unconditional refund guarantee"
- `README.md:104`: "I require a Git checkout"

Keep "I" for decisions and make the system the subject of facts: "The contract has no owner withdrawal", "The Docker path needs no host Node". Slash-compressed phrases read like notes, so expand `:22` ("cancels/confirms/rejects three") and `:65` ("roll back/replay"). `README.md:3` states the single-contract choice without a reason; one clause would make it a decision.

**Navigation: clear in the appendix, weaker in the README.**
- `docs/ai-log/README.md:3,11` plainly says the records are "evidence, not current setup instructions". All four milestone links resolve; I checked filenames only and opened nothing in the archive.
- `README.md:113` puts live references and history under one heading, and `:117` never says "historical". Retitle it "Reference docs and AI history", and add to `:117`: "These are historical records, not current instructions."

## Not verified

These fall outside the files you listed:
- npm script names
- CI wiring (`README.md:96`, `docs/development.md:70`)
- configuration ranges (`docs/development.md:25-27`)
- launcher, demo and projection-store behaviour
- the Ponder recovery-window mechanics (`README.md:65`)

`Dockerfile.app:19` copies the moved spec, but I didn't check whether `.dockerignore` admits it, so that depends on your Docker rerun.

Claude usage remaining:
- Current session: 73% remaining · resets Nov 9 at 5:50am (America/Buenos_Aires)
- Current week (all models): 96% remaining · resets Nov 15 at 12pm (America/Buenos_Aires)
