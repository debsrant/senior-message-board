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
    - `USER`: Can post messages/announcements to the board and opt-in to receive notifications when medications are taken.
    - `VIEWER`: Read-only for content on the kiosk display; write access to log `medsTaken` status.
- Database Structure:
    - `board`: The message board data (`announcement`, `reminders`, `medications`, `medsTaken`, `medsTakenTime`, `zipcode`, weather suggestions, `updatedAt`).
    - `users/{uid}`: Stores user profile and permissions (`role`: `ADMIN` | `USER` | `VIEWER`, `notifyOnMeds`: boolean).

## Key Setup Features

- Real-time `on('value')` listener synchronizes admin and user edits from phone/PC to tablet instantly.
- Multi-view toggling: Display Mode, User Message Panel, and Admin Panel.
- Medication Notification System: Browser push notifications, audio chime, and in-app alerts dispatched to users/admins when medication is logged.
