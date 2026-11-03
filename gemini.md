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
- Main Message Card (3-Column Today Hub): Always-visible top banner in a 3-column layout on tablet/desktop (stacking on phones): Column 1 displays Today's Important Message, Column 2 displays Scheduled for Today (automatically surfacing any major US holiday falling on today alongside today's appointments, or a fixed `"No events scheduled for today"` message when empty to maintain consistent visual positioning for the senior), and Column 3 houses the **"I TOOK MY MEDS"** action button and status banner.
- Upcoming Major US Holidays Card: Automatically fetches and displays upcoming major US federal and cultural holidays (via Nager.Date Public Holidays API + built-in US holiday calendar) with emojis, dates, and countdown badges (`TODAY`, `TOMORROW`, `In X days`).
- Calendar & Appointments: Card inside the 3-column Reminders, Medications, Scheduled Events & Holidays section displaying upcoming doctor visits and events with chronological sorting, senior-friendly badges ("TODAY", "TOMORROW"), notes/driver details, inline appointment editing, and automatic past-event cleanup.
- Admin Card Positioning: ADMIN users can order the 4 cards in the 3-column section (**Daily Reminders**, simplified **Medications** info panel, **Scheduled Events**, and **Upcoming Holidays**) into Position 1, Position 2, Position 3, and Position 4 (`board/cardPositions`).
- Light, Mobile-First UI: High-contrast light color scheme (`bg-slate-100` background, `bg-white` cards, `blue-600` primary actions) with always-visible Main Message card, responsive mobile cards for user management, and 16px (`text-base`) inputs to prevent mobile browser zoom.
- Board Maintenance & Schedules: Available to both EDITOR and ADMIN roles to configure the board title, daily reminders, medication schedules, weather zipcode, activity suggestions, and reset medication check-off status.
- Profile Management: Authenticated users can edit their profile (display name and notification settings) directly within the Admin panel.
- In-App User Management & Account Deactivation: Admins can view all registered users in real time, assign roles (ADMIN, EDITOR, VIEWER), pre-configure new user accounts, and toggle users active/inactive to instantly revoke or restore access without deleting account data.
- Dual-view toggling: Display Mode & Admin/Editor Panel with role-based feature gating and a clean two-column layout (Column 1: Announcements, Events & Publish; Column 2: Profile, Maintenance & Schedules, and Admin-only User Management).
- Medication Notification System: Browser push notifications, audio chime, and in-app alerts dispatched to editors and admins when medication is logged.
