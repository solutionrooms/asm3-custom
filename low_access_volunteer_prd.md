# Low Access Volunteer Flow - Product Requirements Document

## Overview

Provide a restricted, location-scoped experience for volunteers assigned the **"Low Access Volunteer"** role. These users should only see animals in the internal location they have been assigned to, must actively select their location on every login, and should be audited whenever they switch locations.

## Problem Statement

Volunteers with limited responsibilities need access to the shelter system but should be restricted to viewing only animals in their assigned area. Without guardrails, volunteers could accidentally (or intentionally) browse or modify records outside their assigned location. Management (specifically "Clare") needs visibility into when volunteers change their working location.

## Requirements

### 1. Role-Based Identification

- A role named **"Low Access Volunteer"** is used to identify these users.
- The system must detect this role from the user's pipe-separated roles string in the session.
- All low-access-specific behavior is gated on membership in this role.

### 2. Forced Location Selection on Login

- After a Low Access Volunteer logs in, they **must** select an internal location before they can access any other part of the system.
- The user is redirected to a **"Select Location"** screen (`/location_select`) automatically.
- The redirect is enforced on every navigation attempt until a location is chosen (similar to the existing forced password change flow).
- Exceptions: `/logout`, `/change_password`, and `/change_user_settings` are accessible without selecting a location first.

### 3. Location Picker UI

- Displays a dropdown of available internal locations.
- A **warning banner** is shown: *"You should only attempt log-on to the area that you have been assigned to. Clare will be notified on each location switch."*
- On the login-mode screen, the user selects a location and clicks **"Continue"** to proceed.
- On the change-mode screen (accessed later via menu), the flow includes a **confirmation step** before applying the switch:
  - If the selected location matches the current location, the user is informed "Location unchanged" and redirected home.
  - Otherwise, a confirmation prompt shows: *"You are about to switch to: [Location Name]"* with **Confirm** and **Back** buttons.

### 4. Location Filtering

- When a location is selected, the user's `LocationFilter` field in the `users` table is updated to the chosen location ID.
- This leverages ASM3's existing location filter mechanism to restrict the user's view to only animals in that location.
- The session is refreshed after the update so the filter takes effect immediately.

### 5. Excluded Locations

- Internal locations whose `LocationDescription` field contains the text **"Exclude from view"** (case-insensitive) must be:
  - **Hidden** from the location picker dropdown.
  - **Rejected** on submission (server-side validation) to prevent bypass.

### 6. Audit Trail & Notifications

- Every location change writes an **audit log entry** against the user record.
- The audit message includes:
  - The previous location name and ID.
  - The new location name and ID.
  - A note that "Clare notified" (indicating downstream notification is expected).

### 7. Menu Integration

- Low Access Volunteer users see a **"Change Location"** menu item added to the ASM menu (inserted near the top, after "Shelter view").
- This menu item links to `/change_location`, which presents the same location picker but in "change" mode (with confirmation step).
- The menu item is only visible to users with the Low Access Volunteer role.

### 8. Two Endpoints, Shared UI

| Endpoint | URL | Mode | When Used |
|---|---|---|---|
| `location_select` | `/location_select` | `login` | Forced redirect after login |
| `change_location` | `/change_location` | `change` | Voluntary change via menu item |

Both endpoints share the same JavaScript module (`change_location.js`) but differ in behavior:
- **Login mode**: No current-location display, no confirmation step, just select and continue.
- **Change mode**: Shows current location, includes confirmation step before applying.

### 9. Access Control

- Both endpoints are restricted to Low Access Volunteer users only.
- Non-low-access users who attempt to access either endpoint receive a permission error.

## Files Modified

| File | Changes |
|---|---|
| `src/asm3/users.py` | Role constant, `has_role()` helper, `is_low_access_volunteer()` check, session flag `forcelocationselect` |
| `src/asm3/html.py` | `menu_structure()` accepts `is_low_access` param, conditionally inserts "Change Location" menu item |
| `src/main.py` | Helper functions, `check_location_select()` enforcement, `location_select` and `change_location` endpoint classes, low-access flag passed to config JS |
| `src/static/js/change_location.js` | New frontend module for location selection/change UI |
| `MODIFICATIONS.md` | Documentation of the feature |

## Acceptance Criteria

1. A user with the "Low Access Volunteer" role is redirected to location selection immediately after login.
2. The user cannot navigate to any page (except logout/password change) until a location is selected.
3. The location picker only shows internal locations that do not have "Exclude from view" in their description.
4. Selecting a location updates the user's `LocationFilter` and refreshes the session.
5. An audit log entry is created for every location change.
6. The "Change Location" menu item appears only for Low Access Volunteer users.
7. Changing location via the menu requires a confirmation step.
8. Non-low-access users receive a permission error when accessing the location endpoints.
