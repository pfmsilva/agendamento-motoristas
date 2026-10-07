# Repeating services: stored as a rule, dates created only when needed

## What users will see
- Creating a service looks the same. "Repeat this service" now offers:
  - Frequency: daily, every weekday (Mon–Fri), weekly on chosen days, monthly, yearly
  - Start date
  - Ends: a date **or** "No end date"
- Nothing else changes in the calendar's look. A service that repeats with no end date stays in the calendar for as long as people look ahead, and it never needs a made-up far-off end date.
- "Libertar horário" works exactly as now on any date of a repeating service. The rule stays the same; the released time is saved as an exception, and you can still edit or remove it.
- Edit or cancel on a repeating service:
  - **Only this date**: changes that one date only.
  - **This and future**: ends the current rule the day before and starts a new rule from that date with the changes.
  - **Whole series**: updates the rule itself and all dates that are already visible and haven't been changed by hand.

## How it works
One series row holds the rule. Each date gets its own driver, picked by availability as today, so a date becomes a real service only when the system needs it:
- someone opens a week, month or year in the calendar;
- an analysis, export or monthly-hours figure covers that period;
- "Encontrar motorista", assignment or a conflict check looks at that date.

Before reading a period, the app asks the backend to "make sure dates exist up to X" (`ensure_series_range`). The backend creates only the missing dates for that period. A date is never created twice, and never years ahead "just in case". Dates that were edited, cancelled or released are kept as they are.

When a date is created, it checks releases by time, so a release saved earlier for a future date is respected the moment that date appears.

## Loading only what is visible
- Services are loaded **by period** instead of all at once. The calendar asks for its visible range plus a small margin. Analyses ask for their selected period. Monthly hours ask for the month.
- Data already on screen stays visible while the next week loads, so the calendar doesn't flash empty.
- The once-per-session "extend everything 12 months ahead" step is removed.

## Converting existing series
- Open-ended series: future dates that nobody edited, released, reassigned or cancelled, and that are more than about 6 weeks ahead, are removed. They come back automatically when someone views those dates.
- Past dates and any date changed by hand stay untouched. History and audit records are kept.

## Rules page
New and updated entries on "Regras e Automação" covering repetition, exceptions and on-demand dates, plus a history line.

## Technical details
- Migration:
  - `activity_series.weekdays smallint[]` (nullable).
  - New frequency value `weekdays` / weekly with days.
  - `series_occurrence_starts(series, from, to)`: a set-returning function using generate_series.
  - `ensure_series_range(_from date, _to date)`: SECURITY DEFINER. It only covers series the caller can see, and is capped at about 400 days per call. A unique index on `(series_id, series_index)` keeps it idempotent.
  - `create_service_series` creates dates only up to `max(start, today) + 6 weeks`. The 120-occurrence limit applies only to series with an end date.
  - `create_service_auto` / `assign_service_driver` / `create_driver_service` call `ensure_series_range` for the target day first, so conflicts with a series always show.
  - New `update_service_series(_id, _scope, ...)` for "this and future" and "all".
  - `extend_open_series` and `series_horizon` are retired (marked DEPRECATED, no longer called).
  - The cleanup DELETE for the conversion goes through a data query, not a migration.
- Frontend:
  - `useActivitiesRange(from, to)` replaces `useActivities()` in the 8 places that use it. Query keys include the range, with `placeholderData: keepPreviousData`.
  - `activity-link` fetches by id.
  - `RecurrenceFields` gains a weekday picker and "No end date"; preview logic in `src/lib/recurrence.ts`.
- Edits after a "this and future" split stay linked through `activity_series.parent_series_id` for audit.
- Verification:
  - Create an open-ended weekday series and check that a week view creates only about 5 dates.
  - Jump a year ahead and check that dates appear there.
  - Release 15/10 14:00–16:00 and check the time is free for availability and conflicts.
  - Check "Only this date", "This and future" and "Whole series".
  - Check that analyses and monthly hours match.
  - Measure the size of the services request before and after.
