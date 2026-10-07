# Agendamento de Motoristas

Build a web application for managing drivers, schedules, availability, holidays, and assignments.

This is NOT a generic calendar application.

It is a driver resource-management and scheduling system with three user roles, strict permissions, individual calendars, a global manager calendar, automatic synchronization, holiday management, and conflict detection.

The application must be designed so that each assistant can only access the driver(s) assigned to them, while the manager can see and manage all drivers.

1. USER ROLES

Create exactly three roles:

MANAGER

The manager has full access.

The manager can:

 See all drivers.

 See all activities.

 See all holidays and unavailability.

 See the global calendar.

 Create activities.

 Assign activities to any driver.

 Edit any activity.

 Cancel any activity.

 Change the driver assigned to an activity.

 See conflicts.

 Manage drivers.

 Manage assistants.

 Assign assistants to drivers.

 Manage users and permissions.

 Approve or reject holiday requests.

ASSISTANT

Each assistant can only access the driver(s) explicitly assigned to them.

The assistant can:

 See the calendar of their assigned driver(s).

 Create activities for their assigned driver(s).

 Edit activities for their assigned driver(s).

 Cancel activities for their assigned driver(s).

 See holidays of their assigned driver(s).

 See unavailability of their assigned driver(s).

 Organize the weekly schedule.

 See scheduling conflicts involving their assigned driver(s).

The assistant MUST NOT:

 See other drivers.

 See other assistants.

 See calendars belonging to other assistants.

 See the global calendar.

 Access data belonging to drivers not assigned to them.

 Change their own permissions.

 Change assistant-driver assignments.

IMPORTANT:

These restrictions must be enforced at database/backend level.

Do NOT implement privacy simply by hiding information in the frontend.

An assistant must not be able to access another driver's data by changing URLs, IDs, filters, API requests, or frontend code.

DRIVER

Each driver can only access their own calendar.

The driver can:

 See their own activities.

 See their own schedule.

 See relevant trip information.

 Submit holiday requests.

 Submit periods of unavailability.

 See the status of their holiday requests.

The driver MUST NOT:

 See other drivers.

 See other calendars.

 Edit activities created by the manager.

 Edit activities created by an assistant.

 Cancel activities.

 Change the assigned driver.

 Access administrative information belonging to other users.

2. CORE WORKFLOW

The application must support this exact workflow:

MANAGER
→ sees all drivers
→ creates an activity
→ selects a driver
→ activity is assigned to that driver
→ activity automatically appears in that driver's calendar
→ activity automatically appears in the assigned assistant's calendar/view
→ manager sees it in the global calendar.

Example:

Manager creates:

Driver A
Tuesday
14:00–16:00
Airport transfer

The system must automatically show this activity to:

 Manager

 Driver A

 Assistant responsible for Driver A

There must only be ONE activity record in the database.

Do NOT create separate duplicated activities for each user.

3. DATABASE STRUCTURE

Create the following entities/tables.

Users

Fields:

 id

 name

 email

 role

 active

 created_at

 updated_at

Roles:

 manager

 assistant

 driver

Drivers

Fields:

 id

 user_id

 name

 employee_code

 assistant_id

 active

 created_at

 updated_at

Assistants

Fields:

 id

 user_id

 name

 active

 created_at

 updated_at

AssistantDriverAssignments

This table controls which assistants can access which drivers.

Fields:

 id

 assistant_id

 driver_id

 created_at

An assistant can have multiple drivers.

The database should also allow a driver to have multiple assistants if the manager decides this is necessary.

Activities

Fields:

 id

 title

 type

 driver_id

 start_datetime

 end_datetime

 origin

 destination

 passenger

 notes

 status

 created_by

 updated_by

 created_at

 updated_at

Activity status:

 Draft

 Confirmed

 Cancelled

Activity types:

 Trip

 Airport

 Meeting

 Event

 Service

 Availability

 Other

TimeOff

Fields:

 id

 driver_id

 start_date

 end_date

 type

 reason

 notes

 status

 requested_by

 approved_by

 created_at

 updated_at

Statuses:

 Pending

 Approved

 Rejected

 Cancelled

Unavailability

Fields:

 id

 driver_id

 start_datetime

 end_datetime

 reason

 notes

 status

 created_by

 created_at

AuditLog

Fields:

 id

 user_id

 action

 entity_type

 entity_id

 old_value

 new_value

 created_at

Record important changes such as:

 activity created

 activity edited

 activity cancelled

 driver changed

 holiday requested

 holiday approved

 holiday rejected

 permissions changed

4. ROLE-BASED SECURITY

Implement strict Role-Based Access Control.

Manager

Can access all records.

Assistant

Can only access records where:

activity.driver_id belongs to a driver assigned to that assistant.

The same restriction must apply to:

 activities

 holidays

 unavailability

 driver information

Driver

Can only access records where:

activity.driver_id equals their own driver_id.

The same restriction must apply to:

 activities

 holidays

 unavailability

IMPORTANT:

The backend/database must enforce these rules.

Do not rely on frontend filtering.

Test that an assistant cannot access another driver's data by manually modifying an ID or API request.

5. MANAGER DASHBOARD

Create a professional manager dashboard.

Display:

 Total drivers

 Available drivers

 Busy drivers

 Drivers on holiday

 Drivers unavailable

 Scheduling conflicts

 Pending holiday requests

The main component must be the global scheduling calendar.

6. GLOBAL CALENDAR

Create a resource-planning calendar.

The manager must be able to view drivers side-by-side.

Example:

Driver A | 09:00 | 10:00 | 11:00 | 12:00 | 13:00 | 14:00 | 15:00
Driver B | ...
Driver C | ...
Driver D | ...

Each driver must appear on their own row.

The manager must be able to switch between:

 Day

 Week

 Month

The calendar must clearly distinguish:

 Available

 Busy

 Holiday

 Unavailable

 Conflict

The manager must be able to click an empty time slot to create an activity.

If the manager clicks:

Driver A
Tuesday
14:00

open the activity form with:

Driver = Driver A
Date = Tuesday
Start = 14:00

already populated.

7. DRIVER AVAILABILITY

For every driver, calculate their current availability.

Possible states:

AVAILABLE

No activity, holiday, or unavailability exists during the selected period.

BUSY

The driver has an activity during the selected period.

ON_LEAVE

The driver has approved holiday/time off.

UNAVAILABLE

The driver has an unavailability period.

CONFLICT

Two or more activities overlap.

These states must be available to the manager when selecting a driver.

8. FIND AVAILABLE DRIVER

Create a feature called:

"Find Available Driver"

The manager enters:

 Date

 Start time

 End time

Optional:

 Origin

 Destination

The system returns:

AVAILABLE DRIVERS

Driver A
Available

Driver C
Available

UNAVAILABLE DRIVERS

Driver B
Busy 14:00–16:00

Driver D
Holiday

Driver E
Unavailable 13:00–17:00

Sort available drivers first.

The manager should be able to select a driver directly from this result and create the activity.

9. CREATE ACTIVITY

Create an activity form with:

 Title

 Activity type

 Driver

 Date

 Start time

 End time

 Origin

 Destination

 Passenger / executive

 Notes

 Status

The manager can assign any driver.

An assistant can only assign drivers assigned to them.

10. CONFLICT DETECTION

Before saving an activity, check for overlapping activities.

A conflict exists when:

new_start < existing_end

AND

new_end > existing_start

Example:

Existing activity:

14:00–16:00

New activity:

15:00–17:00

Result:

CONFLICT.

Display:

"Driver A already has an activity from 14:00 to 16:00."

The system should:

 Detect the conflict.

 Display a clear warning.

 Recommend another available driver.

 Prevent saving by default.

 Allow the manager to override only after explicit confirmation.

The assistant should not be able to override conflicts unless the manager explicitly grants that permission.

11. HOLIDAYS

Drivers must be able to request holidays.

The driver selects:

 Start date

 End date

 Reason

 Optional notes

Default workflow:

Driver submits request
→ status = Pending
→ manager reviews
→ manager approves/rejects
→ if approved, status = Approved
→ approved period blocks driver availability
→ holiday appears on manager calendar
→ holiday appears on driver's calendar
→ holiday appears to the driver's assigned assistant.

The manager can configure whether assistants can also approve holidays for their assigned drivers.

12. UNAVAILABILITY

Drivers must be able to submit periods of unavailability.

Fields:

 Date

 Start time

 End time

 Reason

 Notes

Examples:

 Personal appointment

 Unavailable

 Other

Unavailability must be considered by the conflict detection system.

13. ASSISTANT INTERFACE

The assistant should have a simple dashboard called:

"My Drivers"

Only their assigned drivers must appear.

The assistant can:

 View calendar

 Create activity

 Edit activity

 Cancel activity

 View holidays

 View unavailability

 View conflicts

Do not display:

 Other drivers

 Other assistants

 Global manager calendar

 Global statistics

 Data belonging to other users

The assistant should be able to switch between their assigned drivers if they have more than one.

14. DRIVER INTERFACE

Create a mobile-friendly interface.

Main page:

"My Schedule"

Display:

 Today

 Tomorrow

 This Week

 Upcoming Activities

Buttons:

"+ Request Holiday"

"+ Add Unavailability"

Activities created by the manager or assistant must be read-only for the driver.

The driver should not see administrative controls.

15. CALENDAR SYNCHRONIZATION

All users must see the same underlying activity record according to their permissions.

If the manager changes:

Driver A
14:00–16:00

to:

Driver B
15:00–17:00

the change must automatically appear everywhere:

 Manager calendar

 Driver A calendar

 Driver B calendar

 Assistant A view

 Assistant B view

Do not create duplicate activity records.

16. ACTIVITY EDITING

When an activity is edited:

 Update the existing database record.

 Recalculate conflicts.

 Recalculate availability.

 Update all authorized views.

 Record the change in AuditLog.

When an activity is cancelled:

Do NOT permanently delete the record.

Set:

status = Cancelled

Keep it in the database for audit purposes.

17. SEARCH AND FILTERS

Manager filters:

 Driver

 Assistant

 Date

 Activity type

 Status

 Availability

 Conflict

Assistant filters:

 Their assigned drivers only

 Date

 Activity type

 Status

Driver filters:

 Their own activities only

 Date

 Activity type

Create a global search for the manager covering:

 Driver

 Activity

 Destination

 Passenger

 Date

18. NOTIFICATIONS

Create an in-app notification system.

Notify users when:

 A new activity is assigned.

 An activity is changed.

 An activity is cancelled.

 A holiday is requested.

 A holiday is approved.

 A holiday is rejected.

 A conflict is detected.

 A driver is changed.

Design the architecture so email and push notifications can be added later.

19. DESIGN

Use a clean professional business interface.

The calendar is the most important component.

Prioritize:

 Calendar

 Driver availability

 Conflict detection

 Fast activity creation

 Simple navigation

Desktop-first for managers and assistants.

Mobile-friendly for drivers.

Use a professional scheduling/resource-planning layout rather than a traditional personal calendar layout.

20. DEMO DATA

Create demo data.

Manager:

Manager User

Assistants:

Assistant A
Assistant B
Assistant C

Drivers:

Driver A → Assistant A
Driver B → Assistant A
Driver C → Assistant B
Driver D → Assistant C
Driver E → Assistant C

Create realistic demo activities, holidays, and availability periods.

21. MANDATORY SECURITY TESTS

Before considering the application complete, test the following.

TEST 1:

Login as Assistant A.

Expected:

Can see Driver A and Driver B.

Cannot see Driver C, Driver D, or Driver E.

TEST 2:

Login as Assistant B.

Expected:

Can see Driver C only.

TEST 3:

Login as Driver A.

Expected:

Can see Driver A's activities only.

TEST 4:

Login as Manager.

Expected:

Can see all drivers and all activities.

TEST 5:

Manager creates activity for Driver A.

Expected:

Activity immediately appears for:

 Manager

 Assistant A

 Driver A

TEST 6:

Manager creates activity for Driver C.

Expected:

Assistant A cannot see it.

TEST 7:

Driver A submits holiday.

Expected:

Manager receives pending request.

TEST 8:

Manager approves holiday.

Expected:

Driver A becomes unavailable during the approved period.

TEST 9:

Manager tries to assign activity during approved holiday.

Expected:

Conflict warning/block.

TEST 10:

Driver A tries to edit an activity created by the manager.

Expected:

Backend rejects the operation.

TEST 11:

Assistant A attempts to access Driver C by manually changing the driver ID in a request.

Expected:

Backend rejects the request.

TEST 12:

Create overlapping activities for the same driver.

Expected:

Conflict is detected.

22. DEVELOPMENT PRIORITY

Build the application in phases.

Do NOT attempt to build every feature simultaneously.

PHASE 1 — Core

Build:

 Authentication

 Users

 Roles

 Drivers

 Assistants

 Assistant-driver assignments

 Activities

 Basic permissions

 Basic calendar

Do not proceed until permissions work correctly.

PHASE 2 — Scheduling

Add:

 Global manager calendar

 Assistant calendar

 Driver calendar

 Activity creation

 Activity editing

 Activity cancellation

 Conflict detection

 Availability calculation

PHASE 3 — Leave Management

Add:

 Holiday requests

 Holiday approval

 Unavailability

 Availability blocking

 Conflict detection with holidays

PHASE 4 — Management

Add:

 Find Available Driver

 Dashboard

 Filters

 Search

 Notifications

 Audit log

PHASE 5 — Polish

Improve:

 Mobile experience

 Calendar UX

 Loading states

 Error handling

 Empty states

 Performance

 Accessibility

23. IMPORTANT DEVELOPMENT RULE

Do not make assumptions about permissions.

If a feature creates a potential privacy or authorization issue, prioritize security over convenience.

Never rely on frontend visibility as a security mechanism.

All sensitive access must be validated server-side/database-side.

Before adding optional features, make sure the core workflow works:

MANAGER
→ sees all drivers
→ creates activity
→ assigns driver

ASSISTANT
→ sees only assigned driver(s)
→ manages their schedules

DRIVER
→ sees only own schedule
→ requests holidays/unavailability

ACTIVITY
→ exists once
→ automatically appears for every authorized user

CONFLICT
→ detected automatically

PRIVACY
→ enforced at backend/database level

The application should not be considered complete until this workflow and all mandatory security tests pass.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/af3e99ae-37c7-4cfd-9d17-729ab00f9551).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
