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
- Main Message Card (Today Hub): Always-visible top banner displaying the daily announcement, automatically surfacing any event(s) scheduled for the current day (`Scheduled for Today`), and housing the interactive **"I TOOK MY MEDS"** check-off button and status banner.
- Calendar & Appointments: Card inside the 2-column Reminders & Medications section displaying upcoming doctor visits and events with side-by-side card wrapping, chronological sorting, senior-friendly badges ("TODAY", "TOMORROW"), notes/driver details, inline appointment editing, and automatic past-event cleanup.
- Admin Card Positioning: ADMIN users can order the 3 cards in the 2-column section (**Daily Reminders**, simplified **Medications** info panel, and **Scheduled Events**) into Position 1, Position 2, and Position 3 (`board/cardPositions`).
- Light, Mobile-First UI: High-contrast light color scheme (`bg-slate-100` background, `bg-white` cards, `blue-600` primary actions) with always-visible Main Message card, responsive mobile cards for user management, and 16px (`text-base`) inputs to prevent mobile browser zoom.
- Board Maintenance & Schedules: Available to both EDITOR and ADMIN roles to configure the board title, daily reminders, medication schedules, weather zipcode, activity suggestions, and reset medication check-off status.
- Profile Management: Authenticated users can edit their profile (display name and notification settings) directly within the Admin panel.
- In-App User Management & Account Deactivation: Admins can view all registered users in real time, assign roles (ADMIN, EDITOR, VIEWER), pre-configure new user accounts, and toggle users active/inactive to instantly revoke or restore access without deleting account data.
- Dual-view toggling: Display Mode & Admin/Editor Panel with role-based feature gating and a clean two-column layout (Column 1: Announcements, Events & Publish; Column 2: Profile, Maintenance & Schedules, and Admin-only User Management).
- Medication Notification System: Browser push notifications, audio chime, and in-app alerts dispatched to editors and admins when medication is logged.
