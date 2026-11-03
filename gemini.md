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
    - `board`: The message board data (`announcement`, `events`, `contacts`, `userContacts`, `aiRules`, `aiAutoRefresh`, `aiSummary`, `cardPositions`, `reminders`, `medications`, `medsTaken`, `medsTakenTime`, `zipcode`, weather suggestions, `updatedAt`).
    - `users/{uid}`: Stores user profile and permissions (`displayName`: string, `phone`: string, `relationship`: string, `birthday`: string, `role`: `ADMIN` | `EDITOR` | `VIEWER`, `active`: boolean, `notifyOnMeds`: boolean).

## Key Setup Features

- Real-time `on('value')` listener synchronizes admin and editor edits from phone/PC to tablet instantly.
- Main Message Card (3-Column Today Hub): Always-visible top banner in a 3-column layout on tablet/desktop (stacking on phones): Column 1 displays Today's Important Message, Column 2 displays Scheduled for Today (automatically surfacing any major US holiday and any active user or contact birthday falling on today alongside today's appointments, or a fixed `"No events scheduled for today"` message when empty to maintain consistent visual positioning for the senior), and Column 3 houses the **"I TOOK MY MEDS"** action button and status banner.
- AI Daily Companion & Action Plan Section (3-Column Banner Below Main Message): Dedicated full-width 3-column section right below the Main Message Card (stacking on phones) with concise 1–2 sentence guidance per column: Column 1 displays **💬 Suggestions for Today** (incorporating medication check-in, the weather activity suggestion removed from the top weather widget, and today's pacing), Column 2 displays **💧 Helpful Health & Prep Tips** (incorporating each scheduled event's `reminder` field alongside proactive health rules like drinking 2–3 extra glasses of water starting 3 days before a scheduled infusion), and Column 3 displays **🌿 Pacing the Next Few Days**. Powered by both a zero-config built-in Smart Care Companion engine and **Gemini 3.8 Flash (`gemini-3.8-flash`)** via the Gemini Interactions API (`v1beta/interactions`).
- Upcoming Major US Holidays Card: Automatically fetches and displays upcoming major US federal and cultural holidays (via Nager.Date Public Holidays API + built-in US holiday calendar) with emojis, dates, and countdown badges (`TODAY`, `TOMORROW`, `In X days`).
- Contacts List & Birthdays Card: Automatically displays all active registered users alongside additional non-user contacts (managed by ADMIN and EDITOR roles in the Contacts & Birthdays section right above User Management), complete with relationship labels, phone numbers, and birthdays (highlighting birthdays falling on today).
- Calendar & Appointments: Card inside the Reminders section displaying upcoming single-day and optional multi-day doctor visits and events (`date` and optional `endDate`) with chronological sorting, senior-friendly badges (`TODAY`, `TODAY • Thru ...`, `TOMORROW`, or date range), notes/driver details, an event-specific `reminder` field (used for AI summaries and displayed on the card), inline appointment editing, and automatic past-event cleanup after the effective end date has passed.
- Scrollable Cards (50% Taller) & Responsive Grid with Admin Card Positioning: All 5 cards in the Reminders section (**Daily Reminders**, simplified **Medications** info panel, **Scheduled Events**, **Upcoming Holidays**, and **Contacts List**) are displayed in a responsive grid (**stacked 1-column on phones**, **2 columns on tablets**, and **3 columns on larger screens**: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`) with a capped height (`max-h-[22.5rem] sm:max-h-96`, 50% taller than before) and internal vertical scrolling (`overflow-y-auto`), and ADMIN users can order them into Position 1 through Position 5 (`board/cardPositions`).
- Light, Mobile-First UI: High-contrast light color scheme (`bg-slate-100` background, `bg-white` cards, `blue-600` primary actions) with always-visible Main Message card, responsive mobile cards for user management, and 16px (`text-base`) inputs to prevent mobile browser zoom.
- 3-Tab Admin & Editor Panel: Organized into 3 focused tabs (`📅 Daily Updates`, `🤖 AI & Board Settings`, and `👥 Contacts, Profile & Users`) to eliminate scroll fatigue. Daily Updates places Today's Message, Daily Reminders, Medications, and Appointments side by side; AI & Board Settings houses Caregiver Prep Rules, optional Gemini API key, Board Title, Weather Zipcode, and Admin Card Ordering; Contacts, Profile & Users houses Contacts & Birthdays, My Profile, and Admin User Management. Redundant manual AI override textboxes and custom weather suggestion inputs have been removed so weather and AI summaries stay 100% automatic.
- Medication Notification System: Browser push notifications, audio chime, and in-app alerts dispatched to editors and admins when medication is logged.
