# Task Brief — LFS-001 Slice 1: Assess + Propose (Summon Button)

- **task-id**: LFS-001-S1
- **team**: lucifer-fullstack-v1
- **assigned-to**: coder-1
- **from**: lead (lucifer, 113-lucifer)
- **date**: 2026-07-28
- **report-path**: ψ/lab/LFS-001/LFS-001-slice1-REPORT.md

---

## Goal

Assess the Summon button on the maw-ui Overview page and produce a written proposal
listing issues found + improvement options for Nat to choose from.

**⚠️ Slice 1 = ASSESS ONLY. No code changes in this slice.**

---

## Target

- Project: Soul-Brews-Studio/maw-ui
- Your worktree: `~/.maw-teams/lucifer-fullstack-v1/coder-1`
- Key file: `src/components/OverviewGrid.tsx`
  - Summon state: ~line 295-298
  - `runSummon` logic: ~line 373-395
  - Render: lines following above
- Page to test: `http://localhost:5174/#overview` (start YOUR own dev server — see below)

---

## Steps

1. **Start your dev server** (never touch port 5173):
   ```bash
   cd ~/.maw-teams/lucifer-fullstack-v1/coder-1
   npm install   # if node_modules missing
   npm run dev -- --port 5174
   ```

2. **Open and exercise the Summon UI** at `http://localhost:5174/#overview`. Test all paths:
   - Select an agent + wake empty (no task)
   - Select an agent + send a task (textarea filled)
   - Error state (if triggerable)
   - No dormant agents available
   - State transitions: idle → waking → sent / idle → waking → error

3. **Read the code** in `src/components/OverviewGrid.tsx` covering the Summon feature.

4. **Write the proposal** at `ψ/lab/LFS-001/LFS-001-slice1-PROPOSAL.md`:
   List each issue/improvement as a separate item:
   ```
   ## Item N: <short title>
   - Current: <what happens now>
   - Proposed: <what to change>
   - Effort: S / M / L
   - Category: UX / Correctness / A11y / Visual
   ```

5. **Commit** the proposal file to your branch (`agents/coder-1`):
   ```bash
   git add ψ/lab/LFS-001/LFS-001-slice1-PROPOSAL.md
   git commit -m "LFS-001-S1: summon button assessment proposal"
   ```

6. **Write report** at `ψ/lab/LFS-001/LFS-001-slice1-REPORT.md` with FINAL-REPORT END.

7. **Report to lead**:
   ```bash
   maw hey 113-lucifer:lucifer-oracle "LFS-001-S1 DONE. Report: ~/.maw-teams/lucifer-fullstack-v1/coder-1/ψ/lab/LFS-001/LFS-001-slice1-REPORT.md" --from local:coder-1
   ```

---

## Done-criteria

- [ ] Dev server ran, all Summon paths exercised manually
- [ ] Proposal file written with ≥3 items, each with current/proposed/effort/category
- [ ] Proposal committed to `agents/coder-1` branch
- [ ] REPORT file with FINAL-REPORT END exists
- [ ] Lead notified via maw hey

---

## Constraints

- No code changes in this slice
- No touching main checkout at `/home/user/ghq/github.com/Soul-Brews-Studio/maw-ui`
- No restarting pid 1162 (port 5173)
