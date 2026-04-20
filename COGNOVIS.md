# cognovis/codegen

This is a long-lived cognovis fork of [atomic-ehr/codegen](https://github.com/atomic-ehr/codegen) — the FHIR TypeScript/Python/C# code generator.

## Why we fork

We consume `@atomic-ehr/codegen` from two production contexts (the Polaris / mira-adapters external integration layer and, longer term, the mira API) and hit regressions on multiple consecutive 0.0.x releases. Rather than pin-and-hand-patch, we maintain this fork as our de-facto upstream until codegen reaches production-quality stability. Every non-trivial change either already exists upstream or has a justified reason to be fork-only.

## Scope

This fork covers **FHIR TypeScript codegen extensions only** — vendor-neutral work that makes sense in a FHIR code generator. Aidbox-specific client code, persistence, validation-at-runtime etc. do **not** live here; they belong in `cognovis/aidbox-ts-sdk`.

In-scope examples:
- Bug fixes in the TypeScript profile writer (e.g. the duplicate-`meta`-key regression in 0.0.10+).
- Scalar slice setters (`setBsnr("12345")` for slices with one primitive leaf after pattern-omit).
- Input-type flattening (`Profile.fromInput({bsnr, ik})`).
- Regression tests for profile patterns our IGs exercise (e.g. `meta.min = 1`).

Out-of-scope: anything that ties the generated output to a specific FHIR server (Aidbox, HAPI, etc.).

## Branch model

| Branch | Purpose | Sync |
|---|---|---|
| `main` | Pure mirror of [atomic-ehr/codegen `main`](https://github.com/atomic-ehr/codegen/tree/main). Never commit to this directly; always fast-forward from upstream. | `git fetch upstream && git reset --hard upstream/main && git push origin main` |
| `cognovis/next` | Our working / integrating branch. All fork-specific features and infra (this file, `.beads/`) live here on top of `main`. | Rebase onto `main` when syncing with upstream. |
| `cognovis/<consumer>` | Consumer snapshot branches (e.g. `cognovis/mira-adapters`) — rebase from `cognovis/next` and add consumer-specific scaffolding such as committed `dist/` for git-URL installs. | Rebase from `cognovis/next` before pinning consumers. |
| `fix/<slug>`, `feat/<slug>` | Short-lived branches cut from pristine `main` for upstream PRs. Never base these on `cognovis/next` — keep them clean so the PR diff only shows the feature. | Delete after upstream merge or close. |

### Current long-lived branches

- `main` — upstream mirror, currently at `373dc665` (atomic-ehr@0.0.12 + py-to-json-resource-type fix)
- `cognovis/next` — upstream + `fix/profile-duplicate-meta-key` + this infra
- `cognovis/mira-adapters` — consumer snapshot with committed `dist/` so `bun add github:cognovis/codegen#cognovis/mira-adapters` works
- `fix/profile-duplicate-meta-key` — in-flight upstream PR [atomic-ehr/codegen#138](https://github.com/atomic-ehr/codegen/pull/138)

## Consumer integration

Consumers pin via git URL to a stable consumer branch, e.g.:

```json
{
  "devDependencies": {
    "@atomic-ehr/codegen": "github:cognovis/codegen#cognovis/mira-adapters"
  }
}
```

The consumer branch includes pre-built `dist/` so bun/npm can use the package without running the fork's build step (bun doesn't install a git dep's devDependencies; committing `dist/` avoids a `prepare: tsup` script that would fail for lack of `tsup`).

When a new cognovis snapshot is needed:
1. On `cognovis/next`, ensure everything builds and tests pass (`bun test test/api && bun run build`).
2. Rebase `cognovis/<consumer>` onto `cognovis/next`.
3. Run `bun run build` and commit the updated `dist/`.
4. Force-push `cognovis/<consumer>` (or move its tip forward).
5. Consumer `bun update @atomic-ehr/codegen`.

## Upstream PR workflow

1. Branch `fix/<slug>` or `feat/<slug>` from `main` — **not** `cognovis/next`. Upstream must see a clean, focused diff.
2. Implement + test. Commit on the `fix/` branch with a conventional-commit message.
3. Rebase `cognovis/next` on top to pick up the fix locally.
4. `gh pr create --repo atomic-ehr/codegen --head cognovis:<branch>` to open the upstream PR.
5. When upstream merges, delete the branch. The equivalent commit lands in `main` on the next upstream sync; `cognovis/next` rebases cleanly and our version of the commit drops out.

If a change is inherently fork-only (e.g. `dist/` on consumer branches, or opinionated API surface we're not ready to propose upstream), document it in the commit message: `fork-only: <reason>`.

## Upstream sync

Cadence: on demand when (a) upstream ships a fix we want, (b) one of our open upstream PRs merges, or (c) periodically (monthly suggestion) to avoid drift.

```bash
# 1. Sync main to upstream
git checkout main && git fetch upstream && git reset --hard upstream/main && git push origin main

# 2. Rebase cognovis/next onto updated main
git checkout cognovis/next && git rebase main

# 3. Re-run tests + build to catch regressions early
bun test test/api/

# 4. Rebase each cognovis/<consumer> onto updated cognovis/next
git checkout cognovis/mira-adapters && git rebase cognovis/next
bun run build && git add dist/ && git commit --amend --no-edit
git push --force-with-lease

# 5. Notify consumers to `bun update`
```

See `.beads/` for the "Upstream sync runbook" bead with scripted tooling (in progress).

## Project state & roadmap

Tracked in `.beads/` (Dolt-backed). See `bd ready` for currently-actionable work.

High-level roadmap:

- **Ship** upstream PR [#138](https://github.com/atomic-ehr/codegen/pull/138) (duplicate-meta fix) — merge or revise per review.
- **Contribute upstream**: regression test for `meta.min = 1` profiles (independent of #138, preventive).
- **Fork-first feature**: scalar slice setters + input-type flattening. Develop in our fork, let it bake against Polaris's KBV usage, then propose upstream once we're confident the API surface is right.
- **Stabilise**: when/if atomic-ehr/codegen reaches 0.1.0 / 1.0.0 with a clear API contract, re-evaluate whether continuing to fork is still warranted.

## Contact

Technical: Malte Sussdorff (malte.sussdorff@cognovis.de)
Upstream maintainer: [ryukzak](https://github.com/ryukzak) — responsive, open to PRs.
