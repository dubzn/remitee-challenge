# Bounded planning spikes

These are decision briefs, not implementation tasks. Status: desk review complete; proposed conclusions are integrated into the SDD and await architecture discussion. The original aggregate timebox was 90 minutes; do not spend another 90 minutes repeating the completed review. Do not build throwaway prototypes until implementation/research code is authorized.

| Spike | Question | Timebox | Output |
| --- | --- | --- | --- |
| [001: token compatibility](001-token-compatibility.md) | What does baseline ERC-20 support promise? | 25 min | Asset policy and adversarial test matrix. |
| [002: indexing and recovery](002-indexing-recovery.md) | What is the smallest correct persistence/recovery design? | 40 min | Atomicity, deduplication, and canonical mismatch policy. |
| [003: API time semantics](003-api-time.md) | How does expiry appear without an on-chain transaction? | 25 min | Response/filter semantics and stale-time behavior. |

Each spike closes with a decision, rejected alternatives, verification needed, and effect on delivery scope. Record those decisions in the canonical SDD rather than duplicating specifications here.

Claude reviewed these questions; [Codex disposition](../outputs/codex/2026-11-03-review-disposition.md) records which advice was adopted or changed. Runtime verification remains future work.
