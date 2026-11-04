# Senior Message Board System - Project Context

## Architecture

- Frontend: Modular zero-build static web app (`index.html`, `styles.css`, `app.js`) using Tailwind CSS and Firebase JS SDK (100% compatible with GitHub Pages).
- Hosting: GitHub Pages.
- Database: Firebase Realtime Database (`board` node).
- Kiosk Display: Android tablet running Fully Kiosk Browser.

## Security & Users

- Authentication: Firebase Auth (Email/Password).
- Roles:
    - `ADMIN`: Full read/write access to board content, medication schedules, settings, and user management (including active/inactive toggles).
    - `EDITOR`: Can post messages/announcements, schedule calendar events/appointments, edit board maintenance and medication/reminder schedules, and customize their user profile.
    - `VIEWER`: Read-only for content on the kiosk display; write access to log `medsTaken` status, `seniorResponse` choices, and `seniorHistory` entries.
- Database Structure:
    - `board`: The message board data (`announcement`, `messages`, `events`, `contacts`, `userContacts`, `aiRules`, `aiFeedback`, `aiQuestion`, `customCheckinQuestion`, `customCheckinChoices`, `seniorResponse`, `seniorHistory`, `aiAutoRefresh`, `aiSummary`, `cardPositions`, `reminders`, `medications`, `medicationNotes`, `medicationList`, `medsTaken`, `medsTakenTime`, `zipcode`, weather suggestions, `updatedAt`).
    - `users/{uid}`: Stores user profile and permissions (`displayName`: string, `phone`: string, `relationship`: string, `birthday`: string, `role`: `ADMIN` | `EDITOR` | `VIEWER`, `active`: boolean, `notifyOnMeds`: boolean).

## Key Setup Features

- Real-time `on('value')` listener synchronizes admin and editor edits from phone/PC to tablet instantly.
- Clock, Weather & Morning Action Header: Prominent Date & Time on the left, Weather Widget in the center, and a simplified Medication Check-In on the right (tactile **"💊 I TOOK MY MEDS"** button that smoothly transforms into a clean **"✅ Meds Logged"** state with timestamp when complete).
- Main Message & Daily Companion Hub (`#card-announcement`): Spacious 2-column layout on tablet/desktop (stacking on phones):
    - Column 1 displays **📣 Today's Important Message** in large type (which automatically hides completely when empty so no placeholder takes up space), **💬 Suggestions for Today** (`#disp-ai-today-plan`) formatted into 2 concise paragraphs written in a warm family voice, and an interactive **Daily Check-In** (`#disp-senior-checkin-section`) where the AI generates dynamic daily questions and learns from the senior's choices over time (with zero icons/emojis).
    - Column 2 displays **📅 Scheduled for Today** (with entry-count badge `#today-events-count-badge`), **💧 Helpful Health & Prep Tips** (`#disp-ai-prep-alerts`), and **🌿 Pacing the Next Few Days** (`#disp-ai-look-ahead`).
- Calendar, Appointments & Merged Upcoming US Holidays (`#card-events`): Displays upcoming single-day and optional multi-day doctor visits, family visits, errands, and events (`date`, `endDate`, `category`: medical/family/errand/service/other, `location`: home/outing) chronologically woven together with the next 4 upcoming major US federal and cultural holidays (fetched via Nager.Date Public Holidays API + built-in US holiday calendar with emojis and countdown badges), senior-friendly badges (`TODAY`, `TODAY • Thru ...`, `TOMORROW`, or date range), notes/driver details, an event-specific `reminder` field, inline appointment editing, and automatic past-event cleanup after the effective end date has passed.
- Contacts List & Birthdays Card (`#card-contacts`): Automatically displays all active registered users alongside additional non-user contacts (managed by ADMIN and EDITOR roles), complete with relationship labels, phone numbers, and birthdays (highlighting birthdays falling on today).
- Consolidated Contact & User Normalization: Centralized normalization utilities (`normalizeUserContact`, `normalizeContactRecord`, `syncCurrentUserContactToBoard`) eliminate duplicate boilerplate code across login, profile saves, user table administration, and contact rendering.
- Scrollable 4-Card Grid with Entry-Count Badges & Admin Card Positioning: All 4 cards in the Reminders & Messages section (**Messages**, **Medications**, **Appointments & Events**, and **Contacts List**) are displayed in a responsive grid (**stacked 1-column on phones**, **2 columns on tablets**, and **3 columns on larger screens**: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`) with a capped height (`max-h-[22.5rem] sm:max-h-96`) and internal vertical scrolling (`overflow-y-auto`). Every scrollable card (plus **Scheduled for Today** in Column 2) shows a dynamic entry-count badge (`1 Message` / `N Messages`, `1 Med` / `N Meds`, etc.) when entries exist and hides the badge when empty. ADMIN users can order the 4 cards into Position 1 through Position 4 (`board/cardPositions`).
- Family Messages Manager: Supports posting, editing, and deleting messages stored under `board/messages/{id}`. Each message card displays the message text, author/user name (prefilled with logged-in user profile name), and formatted post date/time. Admins/editors can optionally set an expiration date; expired messages are automatically filtered out from the kiosk display while remaining visible in the admin list with an "Expired" badge. Fully backward-compatible with legacy `board/reminders` multiline string.
- Structured Medications Manager & Senior Notes: Supports adding, editing, and deleting individual medications stored under `board/medicationList/{id}` with specific medication name/dosage, schedule/timing badge (e.g. "Morning (8:00 AM)"), and dedicated instructions/notes textarea shown to the senior. A separate general medication instructions/notes textarea (`board/medicationNotes`) is displayed at the top of the senior's medication card. Fully backward compatible with legacy multiline text (`board/medications`), and automatically integrated into the AI Daily Companion synthesis prompts.
- Light, Mobile-First UI: High-contrast light color scheme (`bg-slate-100` background, `bg-white` cards, `blue-600` primary actions) with always-visible Main Message card, responsive mobile cards for user management, and 16px (`text-base`) inputs to prevent mobile browser zoom.
- 3-Tab Admin & Editor Panel: Organized into 3 focused tabs (`📅 Daily Updates`, `🤖 AI & Board Settings`, and `👥 Contacts, Profile & Users`) to eliminate scroll fatigue. Daily Updates places Today's Message, Family Messages, Medications, Senior Daily Check-In, and Appointments side by side; AI & Board Settings houses Caregiver Prep Rules, Caregiver Notes & Feedback for AI, optional Gemini API key, Board Title, Weather Zipcode, and Admin Card Ordering; Contacts, Profile & Users houses Contacts & Birthdays, My Profile, and Admin User Management.
- Medication Notification System: Browser push notifications, audio chime, and in-app alerts dispatched to editors and admins when medication is logged.
