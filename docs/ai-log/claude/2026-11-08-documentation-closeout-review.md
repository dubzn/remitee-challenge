**Verdict: READY_WITH_FIXES**

This is static review only. I ran no commands and changed no files. When I say "Codex-observed", I am relying on the closeout record. When I say "verified", I read the file myself.

**Reviewed artifact (fact):** `review.diff` no longer matches the working tree. The diff shows a 139-line `scripts/contract-docs.ts`. The working-tree file is 147 lines and adds checks the snapshot lacks:
- parameter-count checks (`scripts/contract-docs.ts:70,74,88,95`)
- event/error devdoc equality (`:89,96`)
- constant-declaration checks (`:102-103`)

I reviewed the working tree. By file modification order, the SDD and closeout were also edited after the snapshot. That ordering is an inference from timestamps, not a fact.

## Findings

### Required

**R1 (Medium): the evidence record doesn't say which script version produced which result.** `docs-final.log` is the only run of the final script, and it passed once (98 targets, 5 pages). The "58 identical files across two runs" result (`documentation-closeout.md:20`) comes from runs before the new checks were added. The commands that generate the docs (`contract-docs.ts:29-38`) are identical to the snapshot, so that reproducibility still holds for the generated output. The fix is either of:
- Say in the closeout which script version produced the double-run and which produced the final pass, and record the working tree (not `review.diff`) as the reviewed artifact.
- Or re-run twice with the final script.

Also, `:19` under-describes the new checks: parameter counts and event/error devdoc equality aren't mentioned. In the snapshot, the claim at `:40` that "rendered constant declarations" are verified was not backed by any check. The working tree fixes that at `:102-103`.

**R2 (Low, bookkeeping required by D2d):** after recording this review's disposition, update:
- `.docs/sdd/escrow.md:215-222` (D2a–D2d unticked; still says "implementation/testing in progress")
- `.docs/progress.md:5,19` ("review pending")
- `documentation-closeout.md:62` ("review pending")

Keep "new CI step not observed remotely". D1 is the precedent for ticking a check on local evidence; whether to do that for D2 is the candidate's call.

### Optional

**O1 (Low): payout-rollback wording is unconditional.**
- `IEscrow.sol:61,67,74,81` and `contracts/README.md:18` say a failed payout leaves the escrow Pending. But `_pay` sets the status before calling `safeTransfer`, and nothing re-checks balances afterwards (`Escrow.sol:123-126`). A token that falsely reports success therefore ends terminal without paying.
- `token-support.md:15,38` already says "detected" failures. Suggested wording: "A reverting or false-returning transfer leaves the escrow Pending."
- **Don't change the NatSpec now.** Any comment edit changes the metadata and code hash `0x7fb6…`, which invalidates the compatibility record and the integration deployment. Fix only `contracts/README.md:18`, which is not compiled, or defer the NatSpec change.

**O2 (Low): the inheritance link is root-relative** (`contract.Escrow.md:3`; HTML `href="/src/IEscrow.sol/interface.IEscrow.html"`). It is certain to break when the page is opened via `file://`, served under a URL prefix, or viewed as raw Markdown in an editor. `closeout:51` says this "has not been validated"; it would be more accurate to say root serving is required. Consider adding a sentence to `contracts/README.md:29`.

**O3 (Low): two goals are only checked by browser inspection.** The wrapper confirms that existing local targets resolve (`:122-141`), but it never asserts that the Escrow→IEscrow link exists at all. It also checks rendered notices (`:104-108`) but not the rendered `@dev` details on the implementation page. Two one-line assertions would cover both.

**O4 (Low): the native-Foundry instruction is untested.** `contracts/README.md:31` tells native users to run `cd contracts && forge doc --build`. That relies on `foundry.toml`'s `[doc] out = "../.local/contracts-docs"`, which the wrapper always overrides with `--out` (`:34`), and no evidence row covers it. Run it once or label it untested.

**O5 (Info, pre-existing):**
- `.docs/api/README.md:57` still says "Serving the raw specification later…", but it is now implemented (`domain.ts:62`) and covered by the "readiness-independent raw specification" observation in the integration report.
- `README.md:22` has missing spaces: "default42069" / "default3000".

**O6 (Info):** error precedence (existence → Pending → caller → time, `Escrow.sol:70-72`) isn't documented. If you want it, put it in `contracts/README.md`, not NatSpec, to avoid a rehash.

## Answers

**1. NatSpec accuracy:** it matches the code.
- Cancellation is exclusive: it reverts at `>= cancelDeadline` (`Escrow.sol:72`).
- Confirm and reject are exclusive: they revert at `>= expiresAt` (`:81,90`).
- Recovery is inclusive: it reverts only at `< expiresAt` (`:99`).
- "Pending after expiry" is covered in `IEscrow.sol:13,86-87`.
- Rejection actor versus refund recipient is covered in `:73,431` and the struct field at `:27`.
- Token restrictions are covered in `:7-8,81`.
- The source diffs add only `///` lines.
- Struct-field and enum-value docs appear only as raw comments inside code blocks in the generated pages. That is a forge doc limitation, not an accuracy problem.

**2. Wrapper:** proportionate: about 150 lines, Node built-ins only, and the same pattern as `contracts.ts`.
- It fails closed: if the container fails, the assertions never run against stale output.
- No `print.html` is generated, and the sidebar links (`toc.js`) are relative.
- `book.js` contains a `fetch` to play.rust-lang.org. My understanding is that mdBook only uses it for Rust playground code blocks, so the "not exhaustive" caveat is appropriate.
- CI sets up Node before the new docs step (`foundation.yml:30-42`). The job name doesn't mention docs, which is cosmetic.
- The remaining gaps are O2–O4.

**3. S3 status and evidence:**
- The status text in `api/README` matches `openapi.yaml`: three GET operations, `security: []`, a port variable, and no-store responses (`server.ts:90`).
- Published CI (80f1367) is clearly separated from the new docs CI step everywhere: README, progress, SDD:50, delivery plan.
- I verified that the integration project's `deployment.json` has codeHash `0x7fb6…`, the documented build.
- No committed descriptor contains the old hash.
- S4 and S5 are correctly left open.
- I cannot verify remote run 42340576160 myself; that rests on Codex's record.

**4. Decisions to challenge:**
- **Already-accepted policy (re-confirm only):**
  - first successful resolution wins
  - recovery requires an explicit sender transaction
  - simple balance-preserving ERC-20 model
  - no admin, pause or upgrade (#8/#9)
  - anonymous loopback API, Swagger optional (#13/#14)
  - generated output ignored (SDD D2). Note that GitHub readers see only the source NatSpec and `contracts/README`, not the rendered HTML.
- **New decisions in this slice:**
  - Disabling the print view.
  - Disabling MathJax.
  - Accepting the getter devdoc quirk rather than writing getters by hand. I agree with this one.
  - Making the interface the only documentation page for events and errors.
  - Requiring root serving, with python3 as an unpinned host tool for viewing.
  - Reusing an existing local deployment, which keeps the pre-NatSpec bytecode (`deploy-local.ts:18-21`). S4/AC11 should decide whether its clean run forces a fresh deployment.
  - Treating the compatibility comparison as a one-off check rather than a committed script.
  - **Process rule:** freeze the NatSpec now, because any edit means re-running the compatibility check and integration acceptance.

**Recommendation:** commit after R1 and R2, which touch docs only, not source. Take O2–O5 if cheap. Don't make further NatSpec edits in this slice.

Claude usage remaining:
- Current session: 88% remaining · resets Nov 8 at 11pm (America/Buenos_Aires)
- Current week (all models): 99% remaining · resets Nov 15 at 12pm (America/Buenos_Aires)
