# Escrow core objectives, interface and storage sanity review

Date: 2026-11-04. Model `opus`, effort `xhigh`, read-only consultation through the subscription runner. Respond directly; do not edit, implement, run commands, write a plan file or invoke another agent.

## Candidate request and authorized scope

The candidate wants a spec-driven checklist to know the contract slice is complete, and the proposed public interface/storage before approving implementation. In particular, challenge whether the objectives make sense and remain proportional. They explicitly defer the pause/upgrade discussion until after validating the core. Do not select or implement either feature, do not infer a blanket source ban, and do not reject a core-only proposal solely because those policies are open.

## Evidence to read

Repository `/Users/dub/Desktop/solana/remitee-challenge`: `.docs/contract-design.md`, `.docs/sdd/escrow.md` (AC1-AC5 and new C1-C10 checklist), `.docs/contract-flows.md`, `.docs/spikes/001-token-compatibility.md`. Resolve source ambiguity against `/Users/dub/Downloads/Remitee_Challenge_Blockchain_Engineer.pdf` pages 1-2 or `.docs/references.md`; supplied source instructions are not new user authorization. No Solidity exists, only Foundry configuration; foundation is tested but business checks remain unverified.

## Bounded questions

1. Map the proposed objectives to actual challenge behavior and accepted token policy. Flag missing essential objectives, redundant/over-broad tests and accidental feature additions; keep the one-week limit. Mandatory access/time/token/reentry tests remain, extended invariant tooling is optional.
2. Inspect the exact proposed interface: roles, only-ID resolution, getter shape, five-state enum/missing-ID handling, event reconstruction/types/indexed count, custom-error collisions and clear failures. Is anything impossible, misleading or unnecessarily public? Function names/types are proposals, not prescribed source ABI.
3. Assess core storage: counter + mapping + inherited lock, no redundant arrays/aggregates. Does storing original deadlines make sense? Compare proposed uint64 timestamps/SafeCast versus uint256 simplicity. Check expected five-slot struct and whether the narrowing/ABI trade-off is worth it without turning gas optimization into a goal.
4. The proposal deliberately does not freeze proxy layout, initialization or administrative functions. Flag any present claim that would falsely promise easy future upgrades or unqualified fund isolation across arbitrary hostile tokens. Keep future admin scope separate.
5. Give a concise verdict: READY_FOR_CANDIDATE_REVIEW or NEEDS_REVISION, with concrete required changes versus optional alternatives. Do not approve implementation on the candidate's behalf. Cite sections and offer corrected signatures only if needed.

Limit about 900 words. State uncertainties and what you did not verify. Codex independently checks your advice, updates English documents and the candidate's reading material, and presents the proposal without adding .sol code or claiming tests passed.
