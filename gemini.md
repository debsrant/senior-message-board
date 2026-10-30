# Senior Message Board System - Project Context

## Architecture

- Frontend: Single-file `index.html` using Tailwind CSS and Firebase JS SDK.
- Hosting: GitHub Pages.
- Database: Firebase Realtime Database (`board` node).
- Kiosk Display: Android tablet running Fully Kiosk Browser.

## Active Firebase Config Schema

- Node: `board`
- Fields: `announcement`, `reminders`, `medications`, `medsTaken` (boolean), `medsTakenTime` (timestamp), `contacts`, `updatedAt`

## Key Setup Features

- Real-time `on('value')` listener synchronizes admin edits from PC to tablet instantly.
- Dual-view toggling: Display Mode & Admin Panel.
