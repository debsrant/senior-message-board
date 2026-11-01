# Senior Message Board System - Project Context

## Architecture

- Frontend: Single-file `index.html` using Tailwind CSS and Firebase JS SDK.
- Hosting: GitHub Pages.
- Database: Firebase Realtime Database (`board` node).
- Kiosk Display: Android tablet running Fully Kiosk Browser.

## Security & Users

- Authentication: Firebase Auth (Email/Password).
- Roles:
    - `ADMIN`: Full read/write access to board content, medication schedules, settings, and user management.
    - `EDITOR`: Can post messages/announcements to the board, customize their user profile in the Admin panel, and opt-in to receive notifications when medications are taken.
    - `VIEWER`: Read-only for content on the kiosk display; write access to log `medsTaken` status.
- Database Structure:
    - `board`: The message board data (`announcement`, `reminders`, `medications`, `medsTaken`, `medsTakenTime`, `zipcode`, weather suggestions, `updatedAt`).
    - `users/{uid}`: Stores user profile and permissions (`displayName`: string, `role`: `ADMIN` | `EDITOR` | `VIEWER`, `notifyOnMeds`: boolean).

## Key Setup Features

- Real-time `on('value')` listener synchronizes admin and editor edits from phone/PC to tablet instantly.
- Profile Management: Authenticated users can edit their profile (display name and notification settings) directly within the Admin panel.
- In-App User Management: Admins can view all registered users in real time, assign roles (ADMIN, EDITOR, VIEWER), and pre-configure new user accounts directly in the Admin panel.
- Dual-view toggling: Display Mode & Admin/Editor Panel with role-based feature gating.
- Medication Notification System: Browser push notifications, audio chime, and in-app alerts dispatched to editors and admins when medication is logged.
