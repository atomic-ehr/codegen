# cognovis/codegen

This is a cognovis fork of [atomic-ehr/codegen](https://github.com/atomic-ehr/codegen) — the FHIR TypeScript/Python/C# code generator.

## Current status: HIBERNATE

**As of 2026-04-21:** The fork has no production-relevant fork-only code. All of our previous patches (the duplicate-`meta`-key fix, KBV on-the-fly workarounds) are merged upstream and ship in `@atomic-ehr/codegen@0.0.13`. Polaris / mira-adapters consumes `@atomic-ehr/codegen` directly from npm.

The fork is retained for three narrow purposes:
1. **Doc anchor** — this file and the roadmap in `.beads/`
2. **PR staging** — clean `fix/` and `feat/` branches cut from `main` for upstream PRs
3. **Future baking** — a place to develop and production-bake fork-only features before proposing them upstream

When a fork-only feature is actively in development (see "Reactivation" below), we create a fresh consumer-snapshot branch on demand. We deliberately do **not** maintain a standing consumer branch, because that infrastructure (CI builds, committed `dist/`, force-push discipline) has real costs and only earns its keep when there is actual fork-only code to ship.

## Reactivation criteria

Leave hibernate mode when **all** of these hold:
- A fork-only change is developed on `cognovis/next` (starts with the [FORK] epic `codegen-4cw`: scalar slice setters + input-type flattening, once unblocked)
- Polaris / mira-adapters needs to production-bake that change before it lands upstream
- The upstream PR is not yet merged (after merge, we return to hibernate and Polaris goes back to the npm release)

Reactivation steps:
1. Create a fresh `cognovis/mira-adapters` (or analogous) snapshot branch from `cognovis/next`
2. Build `dist/`, commit it on the snapshot branch, push
3. Polaris pins to the git URL: `github:cognovis/codegen#cognovis/mira-adapters`
4. Automate rebuilds if the baking period is non-trivial (GHA on push to `cognovis/next`)
5. After upstream merge and npm release, revert Polaris to the npm dep, archive the snapshot branch as `archive/<date>-<slug>` tag, delete the branch

## Scope (when active)

This fork covers **FHIR codegen extensions only** — vendor-neutral work that makes sense in a FHIR code generator. Aidbox-specific client code, persistence, validation-at-runtime etc. do **not** live here; they belong in `cognovis/aidbox-ts-sdk`.

In-scope examples:
- Bug fixes in the TypeScript profile writer
- Scalar slice setters (`setBsnr("12345")` for slices with one primitive leaf after pattern-omit)
- Input-type flattening (`Profile.fromInput({bsnr, ik})`)
- Regression tests for profile patterns our IGs exercise

Out-of-scope: anything that ties the generated output to a specific FHIR server (Aidbox, HAPI, etc.).

## Release-gate philosophy

Upstream `examples/on-the-fly/kbv-r4/` is the real release gate for anything that touches KBV: it pulls `kbv.ita.for@1.3.1` from Simplifier, generates types, and runs Runtime profile assertions. We rely on it instead of maintaining synthetic companion tests, because:
- Synthetic tests that assert on emitted code structure (regex matches, snapshots) are brittle against legitimate generator refactors
- The on-the-fly test catches the real-world failure modes (package index issues, dependency injection, KBV profile shapes) that synthetic tests miss
- Running `bun test examples/on-the-fly/kbv-r4/` before any cognovis snapshot release is sufficient

If we need offline/CI-resilient smoke coverage in the future, we add it then — not speculatively.

## Branch model

| Branch | Purpose | Sync |
|---|---|---|
| `main` | Pure mirror of [atomic-ehr/codegen `main`](https://github.com/atomic-ehr/codegen/tree/main). Never commit to this directly; always fast-forward from upstream. | `git fetch upstream && git reset --hard upstream/main && git push origin main` |
| `cognovis/next` | Working / integrating branch. Fork-specific features and infra (this file, `.beads/`) live here on top of `main`. | Rebase onto `main` when syncing with upstream. |
| `fix/<slug>`, `feat/<slug>` | Short-lived branches cut from pristine `main` for upstream PRs. Never base these on `cognovis/next` — keep them clean so the PR diff only shows the feature. | Delete after upstream merge or close. |
| `cognovis/<consumer>` | **Not standing.** Created on-demand during reactivation (see above). | Created fresh each time; archived as tag after use. |

### Current long-lived branches

- `main` — upstream mirror at `a7a8dcf9` (atomic-ehr@0.0.13)
- `cognovis/next` — upstream + fork infra (COGNOVIS.md, `.beads/`, CalVer bump)

### Archived

- `archive/2026-04-mira-adapters` — tag preserving the dismantled standing consumer branch from the pre-hibernate era. Restore with `git checkout -b cognovis/mira-adapters archive/2026-04-mira-adapters` if a similar reactivation is needed.

## Upstream PR workflow

1. Branch `fix/<slug>` or `feat/<slug>` from `main` — **not** `cognovis/next`. Upstream must see a clean, focused diff.
2. Implement + test. Commit on the `fix/` branch with a conventional-commit message.
3. Rebase `cognovis/next` on top to pick up the fix locally.
4. `gh pr create --repo atomic-ehr/codegen --head cognovis:<branch>` to open the upstream PR.
5. When upstream merges, delete the branch. The equivalent commit lands in `main` on the next upstream sync; `cognovis/next` rebases cleanly and our version of the commit drops out.

If a change is inherently fork-only (e.g. infra, documentation, opinionated API surface we're not ready to propose upstream), document it in the commit message: `fork-only: <reason>`.

## Upstream sync

Cadence: on demand when (a) upstream ships a fix we want, (b) one of our open upstream PRs merges, or (c) periodically to avoid drift.

```bash
# 1. Sync main to upstream
git checkout main && git fetch upstream && git reset --hard upstream/main && git push origin main

# 2. Rebase cognovis/next onto updated main
git checkout cognovis/next && git rebase main

# 3. Re-run tests to catch regressions early
bun test

# 4. If a consumer-snapshot branch is live (reactivation phase), rebase it as well
# Otherwise (hibernate), we are done.
```

See `.beads/` for the "Upstream sync runbook" bead with scripted tooling (in progress).

## Project state & roadmap

Tracked in `.beads/` (Dolt-backed). See `bd ready` for currently-actionable work.

High-level roadmap:

- **Hibernate maintenance** — keep `cognovis/next` rebased onto upstream; minimal ongoing cost.
- **Fork-first feature: scalar slice setters + input-type flattening** (`codegen-4cw`). Currently blocked on fhir-de builder stabilization in Polaris. Reactivates the consumer-snapshot flow when development starts.
- **Stabilise**: when/if atomic-ehr/codegen reaches 0.1.0 / 1.0.0 with a clear API contract, re-evaluate whether continuing to fork is still warranted.

## Contact

Technical: Malte Sussdorff (malte.sussdorff@cognovis.de)
Upstream maintainer: [ryukzak](https://github.com/ryukzak) — responsive, open to PRs.
