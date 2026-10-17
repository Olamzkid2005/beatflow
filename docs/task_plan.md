# BeatFlow comprehensive review plan

## Current session: M0 reliability repairs

Authorized by the owner after the review. Fix confirmed M0 errors without starting M1 or performing external uploads/deployment.

Acceptance criteria:
- Keep existing uploader interface and direct browser-to-Google media flow; recover within the same session, preserve completed IDs, use confirmed offsets, cap retries, and abort data/status/backoff requests.
- Preserve owner checks in proxy and handlers; public auth session must contain no access/refresh credentials; refreshed JWT cookies must persist on API responses; refresh failures return actionable 401 JSON.
- Stable hydration; strict valid dates; correct timezone conversion; reject nonexistent/ambiguous DST wall times rather than guessing.
- Match YouTube tag/description rules and display server issue details; cancellation works during initialization.
- Required media-probe failures exit nonzero; preserve baseline media/report by using isolated output paths during verification.
- Add native Node regression tests using already installed TypeScript, wire tests into CI, and declare existing zod runtime usage directly. No new service or test framework.
- Run tests/lint/typecheck/build and exercise the production browser/API interface with fake credentials and mocked Google boundaries. Actual production Google CORS/scheduling/quota remains an external M0 gate.

Repair phases:
1. [done] Native Node tests and direct zod declaration.
2. [done] Reliable resumable upload, bounded recovery and cancellation.
3. [done] Server/public auth boundaries, response-persisted refresh, API errors, strict scheduling and UI fixes.
4. [done] Required probe assertions, CI regression command, refreshed M0 acceptance documentation.
5. [done] Final 29 regression tests, lint, TypeScript, production build, two-zone production browser verification and isolated real media probe.

No M1 renderer, deployment, OAuth, or real upload has been started. Remaining M0 acceptance requires the owner's configured Google project and production origin. The M0 page now exposes a 256 KiB chunk option for the required non-final 308/CORS check. Test services are stopped after verification.

## Original review goal and acceptance criteria

Understand the owner's intended end-to-end workflow, review every tracked text/configuration file and the bundled MP4, distinguish current M0 requirements from future M1–M4 work, and deliver prioritized findings with file/line evidence and reproducible checks where possible.

- No application implementation, dependency installation, deployment, uploads, or account changes.
- Preserve existing source files and baseline artifacts; use temporary files for checks.
- Assess the exact rendering interface, MP4 format requirements, low-resource goals, authentication boundaries, upload reliability, and milestone acceptance criteria.
- Do not claim authenticated Google, production CORS, publication, playback in VLC, long-form rendering, or memory acceptance checks passed without evidence.

## Phases

1. [complete] Map product intent, milestone gates, and repository scope.
2. [complete] Review auth, API routes, upload, time conversion, and UI.
3. [complete] Review probe, artifacts, dependencies, configuration, and CI.
4. [complete] Reproduce findings with isolated checks and local HTTP/browser behavior.
5. [complete] Synthesize severity, previous-review corrections, and readiness.

## Baseline

- Working tree initially clean.
- Previous turn already passed lint, typecheck, and production build; do not repeat unchanged checks unnecessarily.
- Review notes are the only intended repository additions.

## Errors / limitations

- No agent-spawning tool is available in this session; review used the available read/search/terminal/browser tools.
- browser-use CLI did not support the skill's deterministic syntax; fresh-profile Chrome CDP fallback succeeded without installation or services.
- Google credentials/deployment/real publishing, external media validators, VLC, long-form rendering, and peak-memory acceptance were unavailable or out of scope.

## Deliverables

- `findings.md`: full product/architecture review, prioritized evidence-backed findings, current external-source corrections, media/performance gaps, verification matrix, milestone sequence.
- `progress.md`: verification and tooling record.
- This plan: all review phases complete; no application fixes were requested or applied.
