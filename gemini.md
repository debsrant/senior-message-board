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
    - `VIEWER`: Read-only for content on the kiosk display; write access to log `medsTaken` status, `seniorResponse` choices, `seniorProfile` favorites, and `seniorJournal` entries.
- Database Structure:
    - `board`: The message board data (`announcement`, `messages`, `events`, `contacts`, `userContacts`, `aiRules`, `aiFeedback`, `aiQuestion`, `customCheckinQuestion`, `customCheckinChoices`, `seniorResponse`, `seniorProfile`, `seniorJournal`, `aiAutoRefresh`, `aiSummary`, `medicationNotes`, `medicationList`, `medsTaken`, `medsTakenTime`, `zipcode`, `updatedAt`).
    - `users/{uid}`: Stores user profile and permissions (`displayName`: string, `phone`: string, `relationship`: string, `birthday`: string, `role`: `ADMIN` | `EDITOR` | `VIEWER`, `active`: boolean, `notifyOnMeds`: boolean).

## Key Setup Features

- Real-time `on('value')` listener synchronizes admin and editor edits from phone/PC to tablet instantly.
- Zero Icons / Emojis Policy & Zero Legacy Bloat: All emojis, icons, and pictorial symbols are strictly excluded across the entire codebase. Legacy transition shims and unused compatibility DOM elements have been completely removed.
- Multi-Page Kiosk Navigation & Alzheimer's Safety Return:
    - **Responsive Kiosk Navigation (`#kiosk-nav-bar`)**: Renders as a **Left Vertical Sidebar** on 7" landscape tablets and desktops to maximize vertical screen space, and automatically adapts to a **Top Multi-Column Grid** (2x3 on phones, 3x2 on portrait tablets). Features 6 large tactile navigation tabs (`Today`, `Weather`, `Medicine`, `Calendar`, `Family`, `Memories`) with real-time text badges (current temperature, medication taken status, upcoming event count, active family message count, saved memory count).
    - **90-Second Auto-Return Safety Timer & Back to Today Buttons**: An automatic 90-second idle timer detects lack of interaction (`touchstart`, `mousedown`, `keydown`, `scroll`) and automatically returns the tablet to the main **"Today"** page. Every sub-page also includes an explicit **"Back to Today"** button in its header.
    - **Single Page View Switching & Spotlight Deep-Linking**: Tab switching toggles dedicated view containers (`disp-page-today`, `disp-page-weather`, `disp-page-meds`, `disp-page-events`, `disp-page-family`, `disp-page-memories`) without reloading the page. Tapping a contextual deep-link pill in the Morning Briefing switches to the target page, smooth-scrolls to the relevant section, and highlights it with a 3-second spotlight ring.
- Clock & Morning Medicine Header: Optimized 60/40 tablet split featuring a prominent Date & Time on the left (60% column, clock up to `text-9xl` and date `text-4xl`), and an extra-large, full-width Morning Medicine status on the right (40% column, tactile **"I TOOK MY MEDS"** button `text-2xl sm:text-3xl lg:text-4xl` that smoothly transforms into a clean **"MEDS LOGGED"** state with timestamp when complete). Automatically uses compact vertical spacing on short 7" landscape viewports.
- Multi-Page Kiosk Views:
    - **Today Page (`#disp-page-today`)**: Uncluttered home screen featuring the Date/Time & Morning Medicine Header, Hero Announcement, and Full-Width Cohesive Morning/Afternoon/Evening Briefing with contextual deep-link pills.
    - **Dedicated Weather Forecast Page (`#disp-page-weather`)**: Full-page forecast featuring "Right Now Outside" conditions, a "What to Wear & Expect Today" comfort guide, nicest outdoor window, Morning/Afternoon/Evening progression cards, and a 3-Day Outlook that automatically notes any scheduled calendar appointments or holidays on those days.
    - **Dedicated Morning Medicine Page (`#disp-page-meds`)**: "Mom's Morning Medicine" view specifically tailored for morning-only medications. Features an instant status banner, a secondary large **"I TOOK MY MEDS"** action button, caregiver storage notes callout box, and individual medication cards with dosages and large, bold instructions.
    - **Dedicated Calendar & Appointments Page (`#disp-page-events`)**: Full-screen agenda view displaying upcoming medical appointments, outings, driver notes, and preparation advice woven together with upcoming US federal and cultural holidays.
    - **Unified Family & Friends Page (`#disp-page-family`)**: Dedicated family hub placing **Love Notes from Family (`#disp-messages`) ABOVE the Family & Friends Directory (`#disp-contacts-list`)**.
    - **Dedicated Memories & Favorite Things Page (`#disp-page-memories`)**: Interactive reminiscence and preference-discovery hub featuring:
        1. **Interactive Memory & Favorite Things Spark (`#card-memories-spark`)**: Multi-turn nostalgic conversation and **"Tap & Speak Your Story"** voice journaling. Uses AI-personalized daily prompts (`data.aiQuestion`) alongside curated reminiscence sparks, and always includes low-pressure opt-out choices (`"Not sure today"`, `"None of these"`, `"I'm all done for now"`). Includes `"Try Another Topic"` and `"Share Another Topic"` buttons so Mom can share as many memories as she likes.
        2. **Favorite Things & Joys (`#card-memories-favorites`)**: Displays Mom's cumulative learned preferences (`board/seniorProfile/favorites`) as tactile tags that she can tap to record a story about.
        3. **Your Memory Book (`#card-memories-storybook`)**: Large-print keepsake gallery displaying Mom's saved stories and reflections right on the tablet for Mom and visiting family to enjoy together.
- Cohesive Daily Briefing, AI Learning Loop & Contextual Deep-Linking:
    - Formats the day's summary into a **single cohesive 2 to 3 paragraph letter** spanning the full width of the Today page with zero repetition across paragraphs and dynamic time-of-day headings (`Morning Briefing`, `Afternoon Briefing`, `Evening Briefing`).
    - **Paragraph 1 (Greeting, Weather Feel & Morning Medicine)**: Combines a weekday greeting, natural zero-number weather feel, and live morning medicine status (automatically updating the instant Mom taps "I TOOK MY MEDS").
    - **Paragraph 2 (Today's Flow, Schedule, Who is Helping & Prep)**: Synthesizes today's appointments, driver/companion notes, and upcoming multi-day prep (or open-calendar reassurance) without duplicating reminders.
    - **Paragraph 3 (Family Connection, Celebrations & Creative Activity Suggestion)**: Weaves active family notes, upcoming birthdays/holidays, and **1 creative, non-parroting activity suggestion** inspired by Mom's learned `seniorProfile` favorites and `seniorJournal` stories (never quoting her raw multiple-choice button answers back to her).
    - **Selective Bolding & Inline Deep-Link Pills**: Uses bold formatting strictly for concrete actions, times, and highlights, and attaches tactile deep-link buttons (`Weather Forecast ->`, `Morning Medicine ->`, `View Calendar ->`, `Read Family Notes ->`, `Memories & Favorites ->`) at the end of relevant paragraphs.
- 4-Tab Dedicated Admin & Editor Panel:
    - **Tab 1: Daily Updates (`#admin-tab-daily`)**: Today's Important Message, Medication Instructions & Daily Status, Prescriptions & Schedule, Family Messages, and Appointments & Events.
    - **Tab 2: Memories (`#admin-tab-checkin`)**: Today's Shared Memory status, editable **Learned Favorites & Joys (`seniorProfile`)** profile, Memory & Preference Prompt Settings (with "Suggest Ideas" bank), Caregiver Story Catcher Voice Interview with AI Story Polishing, and chronological Mom's Memory Journal with Markdown and PDF export.
    - **Tab 3: AI & Board Settings (`#admin-tab-settings`)**: Caregiver Prep Rules, Caregiver Notes & Feedback for AI, Board Title & Weather Zipcode, and Admin-Only Gemini API Key card.
    - **Tab 4: Contacts & Users (`#admin-tab-people`)**: Contacts & Birthdays directory, User Profile, and Admin User Role Management.
