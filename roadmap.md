# Document Approval System — Improvements Roadmap

Source: Document_Approval_Management_System_Improvements.docx (uploaded 2026-09-01)

## Phase 1 — Access, stamp, filenames
- [ ] Remove Reports from trainer role (UI nav + server-side guard in reports functions)
- [ ] Admin-controlled report access permissions (which roles/users can view reports)
- [ ] Approval stamp: place at end of last page (no extra page), auto date inside rectangle, hide verifier name (keep in audit data)
- [ ] Preserve and display original uploaded filename on view/download

## Phase 2 — Organization & reporting
- [ ] Library folders: department > trainer > document type
- [ ] Table-based reports: trainer, department, doc type, submission date, deadline, status
- [ ] Submitted vs not-submitted view; approved/pending/rejected/overdue
- [ ] Filters: department, trainer, doc type, approval status, submission status, date range
- [ ] Search, print, export (CSV)

## Phase 3 — Admin controls
- [ ] User CRUD: create/edit/activate/deactivate, assign department, roles, permissions
- [ ] Manage document types (configurable)
- [ ] Submission deadlines per document type/department; on-time / late / not submitted
- [ ] Allow or restrict late submissions
- [ ] Homepage image management (upload/replace/remove/order) without code changes

## Phase 4 — Notifications, homepage, responsiveness
- [ ] Trainer notifications: submitted, approved, rejected, resubmission required
- [ ] Deadline-approaching reminders and overdue alerts
- [ ] Verifier notifications for pending reviews; admin overdue monitoring
- [ ] Homepage redesign with institutional imagery + process explanation
- [ ] Full responsive pass (tables, dashboards, upload/approval pages)

## Phase 5 — Approval flow & audit
- [ ] Rejection reason required; resubmission with version history retained
- [ ] Audit trail incl. downloads and admin changes; admin-only view
