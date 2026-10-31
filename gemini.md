# Senior Message Board System - Project Context

## Architecture

- Frontend: Single-file `index.html` using Tailwind CSS and Firebase JS SDK.
- Hosting: GitHub Pages.
- Database: Firebase Realtime Database (`board` node).
- Kiosk Display: Android tablet running Fully Kiosk Browser.

## Security & Users

- Authentication: Firebase Auth (Email/Password).
- Roles:
    - `ADMIN`: Full read/write access.
    - `VIEWER`: Read-only for content, write access to `medsTaken` status.
- Database Structure:
    - `boards/default`: The message board data.
    - `users/{uid}`: Stores user profile and permissions (`role`, `notifyOnMeds`).

## Key Setup Features

- Real-time `on('value')` listener synchronizes admin edits from PC to tablet instantly.
- Dual-view toggling: Display Mode & Admin Panel.
