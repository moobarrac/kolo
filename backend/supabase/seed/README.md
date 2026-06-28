# Golden fixture — Appendix A

This directory holds the **golden test fixture** from Appendix A of the spec
(Jan–Mar 2026, base ₦, with a USD account). It is the correctness oracle: seed it,
run the pipeline, and assert the closing numbers. If they don't tie to the minor
unit, the implementation is wrong (§0, §16).

The run must reproduce, three independent ways, for each month:

| date    | net worth (₦) |
|---------|---------------|
| 1 Jan   |  9,600,000    |
| 31 Jan  | 13,100,000    |
| 28 Feb  | 14,990,000    |
| 31 Mar  | 14,890,000    |

Each month must tie via (1) the balance sheet, (2) the equity roll-forward, and
(3) the net-worth articulation bridge (§4.4).

Rates: 1 Jan 1,500 · 31 Jan 1,550 · 18 Feb (bank) 1,640 · 28 Feb 1,650 · 31 Mar 1,600.

`fixture.ts` is implemented in **Phase 1** (NGN-only months reproduce) and completed
in **Phase 5** (full Jan–Mar NGN+USD run). It is intentionally empty until then so
it never silently "passes" against an incomplete engine.
