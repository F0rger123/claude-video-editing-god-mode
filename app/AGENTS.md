# AGENTS.md — God Mode Cut

Instructions for every coding agent working in this repo.

- **Never replace or rewrite the editing engine** (`herk-edit-kit`, the Herk Edit Kit). The PWA drives it only through
  `bridge/` and the editor's Drive folder protocol (docs/EDITOR-INTEGRATION.md). Change the editor
  only when integration genuinely requires it, incrementally.
- Rules: migrations are append-only; RLS on every table; staff checks use
  `content_is_staff()`, client checks `content_can(ws, flag)`; new `security definer` functions
  need `set search_path`, `revoke … from public`, targeted grants, and a case in
  `supabase/tests/isolation.test.sql`.
- Server actions: `getStaffClient()` / `getUserClient()` from `src/lib/actions.ts`, prove access
  through RLS before using `createAdminClient()`.
- Business rules belong in `src/lib/domain` (pure, tested) or `src/lib/workflow.ts`, not in pages.
- Integrations go behind adapters in `src/lib/integrations`.
- Grayscale design; hue only for status (attention / danger / success). No fake UI.
- Before pushing: `npm run lint && npx tsc --noEmit && npm test && npm run build` and
  `bash supabase/tests/run.sh` for SQL changes. A push to `main` is a deploy.
- Never commit secrets (`.env.local`, `bridge/.env`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
