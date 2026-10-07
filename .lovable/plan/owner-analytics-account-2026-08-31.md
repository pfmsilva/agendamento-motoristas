# Owner / Analytics account

Add a fourth role — **owner** — with full read access to everything and a dedicated analytics page with driver workload KPIs.

## What you get

A new "Analytics" section (top nav) visible to owners and managers, showing for any date range you pick:

- **Headline KPIs**: total activities, total driving hours, average hours per driver, utilisation %, cancelled rate, conflicts overridden, holiday days taken, unavailability hours.
- **Per-driver table**: activities count, total hours, average activity length, days worked, holiday days, unavailable hours, utilisation vs. available working time — sortable, with a CSV export.
- **Charts**: hours per driver (bar), activity volume over time (line), activity mix by type (donut), holidays/unavailability by month.
- **Assistant view**: activity volume and hours by assistant's driver pool, plus approvals handled.
- Filters: date range presets (this week / month / quarter / year / custom), driver, assistant, activity type, include or exclude cancelled.

Your account gets read access to every driver, activity, holiday, unavailability record and the audit log — no editing needed, but you keep the admin screens too.

## How it works (technical)

1. **Migration**
   - Add `'owner'` to the `app_role` enum.
   - Add `public.is_owner()` and `public.is_admin_view()` (owner or manager) security-definer helpers, with `EXECUTE` granted to `authenticated` only (consistent with existing helpers).
   - Extend `can_view_driver()` and the read policies on `drivers`, `activities`, `time_off`, `unavailability`, `assistants`, `assistant_driver_assignments`, `profiles`, `audit_log` so owners can read all rows. Owners get no extra write policies beyond manager-equivalent ones we already keep for managers only.
   - Seed an owner account so you can sign in immediately (`owner@demo.com` / `demo1234`), and let you swap in your real email afterwards from the admin screen.

2. **Frontend**
   - `src/lib/auth.tsx`: add `"owner"` to `AppRole`.
   - `src/lib/analytics.ts`: pure functions computing hours, per-driver aggregates, utilisation, mix by type and time series from the existing activities / time_off / unavailability data already loaded by `src/lib/data.ts`.
   - `src/components/dashboards/OwnerDashboard.tsx`: KPI cards + filters + charts (recharts, already used in the shadcn stack) + per-driver table with CSV export.
   - `src/routes/_authenticated/analytics.tsx`: new route rendering the analytics page, with its own head metadata.
   - `src/routes/_authenticated/app.tsx`: route `owner` role to the owner dashboard.
   - `src/components/AppShell.tsx`: show "Analytics" nav link for owner and manager; keep "Administration" for owner and manager.
   - `src/routes/_authenticated/admin.tsx`: allow assigning the `owner` role in the people/roles UI.

3. **Working-time assumption for utilisation** — utilisation = booked hours ÷ available hours, where available hours = business days in range × 8h, minus approved holiday and unavailability. This constant lives in one place so it can be changed later.
