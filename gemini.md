# Senior Message Board System - Project Context

## Architecture

- Frontend: Single-file `index.html` using Tailwind CSS and Firebase JS SDK.
- Hosting: GitHub Pages.
- Database: Firebase Realtime Database (`board` node).
- Kiosk Display: Android tablet running Fully Kiosk Browser.

## Security & Users

- Authentication: Firebase Auth (Email/Password).
- Roles:
    - `ADMIN`: Full read/write access to board content, medication schedules, settings, and user management (including active/inactive toggles).
    - `EDITOR`: Can post messages/announcements, schedule calendar events/appointments, edit board maintenance and medication/reminder schedules, and customize their user profile.
    - `VIEWER`: Read-only for content on the kiosk display; write access to log `medsTaken` status.
- Database Structure:
    - `board`: The message board data (`announcement`, `events`, `reminders`, `medications`, `medsTaken`, `medsTakenTime`, `zipcode`, weather suggestions, `updatedAt`).
    - `users/{uid}`: Stores user profile and permissions (`displayName`: string, `role`: `ADMIN` | `EDITOR` | `VIEWER`, `active`: boolean, `notifyOnMeds`: boolean).

## Key Setup Features

- Real-time `on('value')` listener synchronizes admin and editor edits from phone/PC to tablet instantly.
- Calendar & Appointments: Full-width banner displaying upcoming doctor visits and events with side-by-side card wrapping, chronological sorting, senior-friendly badges ("TODAY", "TOMORROW"), notes/driver details, and automatic past-event cleanup.
- Board Maintenance & Schedules: Available to both EDITOR and ADMIN roles to configure the board title, daily reminders, medication schedules, weather zipcode, activity suggestions, and reset medication check-off status.
- Profile Management: Authenticated users can edit their profile (display name and notification settings) directly within the Admin panel.
- In-App User Management & Account Deactivation: Admins can view all registered users in real time, assign roles (ADMIN, EDITOR, VIEWER), pre-configure new user accounts, and toggle users active/inactive to instantly revoke or restore access without deleting account data.
- Dual-view toggling: Display Mode & Admin/Editor Panel with role-based feature gating and a clean two-column layout (Column 1: Announcements, Events & Publish; Column 2: Profile, Maintenance & Schedules, and Admin-only User Management).
- Medication Notification System: Browser push notifications, audio chime, and in-app alerts dispatched to editors and admins when medication is logged.
