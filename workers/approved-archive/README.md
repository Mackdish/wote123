# Approved archive worker

This service builds stamped ZIPs outside the user's browser and writes the completed archive to the existing `documents` Storage bucket and `bundle_cache` table.

## Required database migration

Apply `supabase/migrations/20260928120000_approved_archive_worker.sql` to the connected Supabase project. It creates the queue, approval/document triggers, and a service-role-only job-claim RPC. The migration also queues a first build for the current approved documents.

## Deploy with Docker Compose

From the repository root, copy `workers/approved-archive/.env.example` to `workers/approved-archive/.env`, then fill in the real values (do not commit it):

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
WORKER_POLL_MS=2500
```

Start the worker:

```bash
docker compose --env-file workers/approved-archive/.env -f workers/approved-archive/docker-compose.yml up -d --build
docker compose --env-file workers/approved-archive/.env -f workers/approved-archive/docker-compose.yml logs -f
```

Keep the service running. It needs network access to Supabase and a valid service-role key. The key is a server secret and must never be exposed to the browser.

## Behavior

- Jobs are queued when a document becomes approved, an approved document's archive-relevant fields change, or final IQA approval history is recorded.
- The worker claims jobs using `claim_approved_archive_jobs`, stamps PDF/DOCX/DOCM files with the HOD and IQA stamps, builds ZIPs, and stores them under `_stamped_bundles/`.
- DOCX/DOCM conversion uses LibreOffice. Page layout can differ slightly from the browser's previous `docx-preview` rendering.
- Failed jobs are marked `failed`; an administrator can retry from the dashboard.
- A download is immediate after the matching archive is ready. First-time generation depends on document count, file sizes, and worker capacity.

## Important

The worker must be deployed and the migration applied before the dashboard can use background archives. Deploying the web app alone does not start this service.
