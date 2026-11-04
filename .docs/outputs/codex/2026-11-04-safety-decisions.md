# Safety follow-up: Codex decisions and independent review

Date: 2026-11-04. Planning only. Input: [Claude Opus/high consultation](../claude/2026-11-04-safety-review.md). Explanation: [safety review](../../safety-review.md).

## Confirmed candidate choices

- AC6 stays observation/traceability only: no signing, submission, or wallet retry service.
- Keep simple ERC-20 economics, mandatory no-return compatibility, and per-escrow token selection; no fee/rebase/allowlist extension now.
- Pause/gateway requested for discussion, not yet selected authority or implementation scope.

## Adopted proposals

- One ordered writer remains the starting point. Performance must be measured using eligible backlog, range/event volume, RPC versus commit timings and retries. Bounded RPC prefetch is future work, with ordered contiguous commits.
- Explain inclusion, waiting, eligibility, committed projection and consensus finality separately. Propose local delay 2 additional blocks; 0 only an explicit fast mode. Extra blocks must be mined in the demo.
- Keep one admitted-event journal. A provisional trace is feasible, but not required to explain the existing delay or satisfy the baseline. Deeper reorg handling remains necessary after waiting.
- Compare no pause, admission-only pause, release pause with refunds open, and all-outflow pause. Current recommendation is exact challenge behavior without a gateway; the candidate's authority decision remains open.

## Independent checks and qualifications

- Official Ethereum documentation verifies 12-second slots and missed slots. Do not repeat Claude's approximate 13-minute finality claim as a fixed guarantee; this plan does not need that number.
- Anvil can mine through explicit RPC controls, not only transaction arrival or interval mode. The demo must not wait indefinitely for idle confirmations.
- Eligible is not yet projected until the DB commit succeeds. Use separate backlog metadata rather than imply instant application.
- A provisional view need not use a separate physical table; its cost is additional observation/orphan/promotion semantics. Do not overstate schema complexity as a reason to reject it.
- Claude's forwarding criticism is too absolute: a correctly designed signed forwarder need not authorize arbitrary impersonation. It does change caller/authentication assumptions and is unnecessary scope here. A shared read-only pause controller is distinct from a forwarding gateway.
- A controller failure blocks the paths that consult it, not automatically every exit. No-pause avoids an admin veto but does not guarantee exits against every code/token/network failure.
- Leaving expiry recovery unpaused is necessary for that particular pause escape, not sufficient to guarantee no lock/loss; refund bugs and token restrictions remain.
- Pausing release can censor a beneficiary until expiry and alter who ultimately receives funds. Creation-only pause also deviates from unconditional creation. Do not silently accept either as preserving all challenge rules.
- Source clarification after the candidate's question: no literal ban on owner, pause, gateway or upgrades appears in the challenge. The literal prohibition is third-party/owner fund movement. Availability conflicts are our interpretation of the explicit action table, not an express ban or evidence that Remitee would reject every pause policy. Earlier categorical language in the raw consultation should not be treated as an additional requirement.

The raw Claude output is preserved, including its read-only plan-tool preamble and references to the output file while it was empty. No application code, gateway, pauser, concurrent fetcher, or benchmark was produced. No new commit is created by this review.
