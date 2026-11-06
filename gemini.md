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
    - `board`: The message board data (`announcement`, `messages`, `events`, `contacts`, `userContacts`, `aiRules`, `aiFeedback`, `aiQuestion`, `customCheckinQuestion`, `customCheckinChoices`, `seniorResponse`, `seniorHistory`, `aiAutoRefresh`, `aiSummary`, `cardPositions`, `medicationNotes`, `medicationList`, `medsTaken`, `medsTakenTime`, `zipcode`, weather suggestions, `updatedAt`).
    - `users/{uid}`: Stores user profile and permissions (`displayName`: string, `phone`: string, `relationship`: string, `birthday`: string, `role`: `ADMIN` | `EDITOR` | `VIEWER`, `active`: boolean, `notifyOnMeds`: boolean).

## Key Setup Features

- Real-time `on('value')` listener synchronizes admin and editor edits from phone/PC to tablet instantly.
- Zero Icons / Emojis Policy: All emojis, icons, and pictorial symbols have been completely removed across the entire codebase (kiosk display buttons, navigation tabs, cards, headers, generated strings, toasts, and remote admin panel). This maximizes usable real estate for large font sizes (24–32px) needed for an 80+ senior with early-stage Alzheimer's and low vision.
- Multi-Page Kiosk Navigation & Alzheimer's Safety Return:
    - **Tactile Kiosk Navigation Bar (`#kiosk-nav-bar`)**: Large, high-contrast text navigation tabs (`Today`, `Medicine`, `Calendar`, `Family & Friends`) anchored right below the header with real-time text badges (medication taken status, upcoming event count, active family message count).
    - **90-Second Auto-Return Safety Timer**: Seniors with Alzheimer's often tap into a sub-page and walk away. An automatic 90-second idle timer detects lack of interaction (`touchstart`, `mousedown`, `keydown`, `scroll`) and automatically returns the tablet to the main **"Today"** page so the clock and morning reminders are always front and center.
    - **Single Page View Switching**: Tab switching toggles dedicated view containers (`disp-page-today`, `disp-page-meds`, `disp-page-events`, `disp-page-family`) without reloading the page, preventing WebSocket disconnection from Firebase and eliminating browser flicker on the tablet.
- Clock & Medication Action Header: Optimized 60/40 tablet split featuring a prominent Date & Time on the left (60% column, clock up to `text-9xl` and date `text-4xl`), and an extra-large, full-width Medication Check-In on the right (40% column, tactile **"I TOOK MY MEDS"** button `text-2xl sm:text-3xl lg:text-4xl` that smoothly transforms into a clean **"MEDS LOGGED"** state with timestamp when complete). The visual weather widget has been removed from the header to declutter the tablet display, while weather data is continuously fetched in the background and utilized for the AI summaries and Morning Briefing.
- Multi-Page Kiosk Views:
    - **Today Page (`#disp-page-today`)**: Uncluttered home screen featuring the Date/Time & Meds Header, Hero Announcement, Morning Briefing, and Conversational Daily Check-In. Zero secondary cards below, eliminating visual overwhelm.
    - **Dedicated Morning Medicine Page (`#disp-page-meds`)**: "Mom's Morning Medicine" view specifically tailored for morning-only medications (no confusing afternoon/evening/bedtime groupings). Features an instant status banner, a secondary large **"I TOOK MY MEDS"** action button, caregiver storage notes callout box, and individual medication cards with dosages and large, bold instructions.
    - **Dedicated Calendar & Appointments Page (`#disp-page-events`)**: Full-screen agenda view displaying upcoming medical appointments, outings, driver notes, and preparation advice woven together with upcoming US federal and cultural holidays.
    - **Unified Family & Friends Page (`#disp-page-family`) (Idea C)**: Dedicated family hub placing **Love Notes from Family (`#disp-messages`) ABOVE the Family & Friends Directory (`#disp-contacts-list`)**. Formatted in beautiful, warm postcard styles. To accommodate Mom's tablet without a SIM card and avoid confusion, all call buttons (`tel:`), email links, and messaging interfaces have been removed; phone numbers remain visible as plain text for caregiver reference.
- Morning Briefing & Family Message Integration (Idea D):
    - Left column of the Today page formats the day's briefing into **2 to 5 short, spaced paragraphs (1–2 sentences each)** separated by generous vertical whitespace (`space-y-4 sm:space-y-5`) instead of a checklist.
    - Weather is described completely naturally **without using any numbers** (no degrees, percentages, or digits).
    - Specific action items are formatted in bold anchors (`<strong class="font-black text-slate-950">`).
    - **Idea D Integration**: Active family messages are seamlessly woven into the briefing (e.g. *Sarah sent a loving note: "Thinking of you Mom." **Enjoy hearing from family** today.*), giving Mom immediate, warm updates right on her morning briefing.
    - **Memory Celebration**: When Mom records a spoken story or memory reflection, Paragraph 5 of the morning briefing celebrates her story without testing her recall (e.g. *"We loved hearing your story about Buster yesterday. **Enjoy some comforting music** this afternoon."*).
- Main Message & Daily Companion Hub (`#card-announcement`):
    - **Hero Announcement (Across Top)**: Displays **Today's Important Message** in prominent type (`text-3xl sm:text-4xl lg:text-5xl font-black`) spanning full width; automatically hides when empty so no placeholder takes up space.
    - **Right Column - Conversational Daily Check-In & Voice Journaling (`#disp-senior-checkin-section`)**: Authentic, low-pressure conversation specifically designed for seniors with early-stage Alzheimer's:
        1. **Enduring Reminiscence**: Focuses on enduring long-term memories (big band and classical music, childhood hometown memories, baking aromas, comforting pastimes, daydreams) rather than testing fragile short-term recall. Zero emojis anywhere.
        2. **Low-Pressure Escape Hatches**: Always includes options like "Not sure today" or "None of these" so the senior never feels quizzed, tested, or pressured.
        3. **Instant Question Cycling**: A dedicated "Another Question" button instantly swaps the topic on screen without leaving the page.
        4. **Multi-Turn Follow-Ups**: Selecting a substantive answer moves to Turn 2 with a warm reaction badge, a gentle follow-up question, and choices that always include an "I'm all done for now" graceful exit option.
        5. **Option 1: Kiosk "Tap & Talk" Voice Journaling (`#disp-checkin-voice`)**:
            - Prominent **"Tap & Speak Your Story"** button on Turn 1 (and Turn 2).
            - Tapping the button switches into an inviting, high-contrast voice recording view with a pulsating recording indicator, comforting reassurance (*"Listening to your words... Take all the time you need, Mom"*), live real-time speech transcription in large 24px bold font, and an oversized **"Finished Speaking"** button.
            - **8-Second Silence Detector**: Automatically finalizes and saves the story when Mom finishes speaking without requiring her to tap a button.
            - **AI Story Polisher**: Cleans conversational hesitations and stutter while preserving her authentic colloquial voice, dialect, and words; generates a meaningful story title; and records into her permanent Memory Journal.
            - Displays a warm on-screen confirmation badge: *"Mom's Memory Recorded"* with the story title and excerpt.
    - **In-Page Senior Memory Journal & Option 2 Caregiver "Story Catcher" Mode (No Popups)**:
        - Every response, spoken story, and caregiver note is permanently saved in Firebase under `board/seniorJournal/{id}`.
        - **Option 2: Caregiver Story Catcher Interview (`#journal-story-catcher-container`)**:
            - Accessible directly in-page within the dedicated **"Check-In & Memories"** admin tab without modal popups.
            - Features a dynamic deck of **AI Conversation Sparks** with clickable prompt cards spanning 12+ curated reminiscence themes (Sunday dinner recipes, high school dances, childhood street games, first car, beloved pets, courtship, summer trips).
            - Caregiver taps **"Start Voice Interview"** while sitting with Mom; transcribes their live conversation in real time with an elapsed recording timer.
            - **"Format Story with AI"**: Uses Gemini 3.8 Flash (or smart rule-based fallback) to structure the conversation into a heartwarming first-person narrative story in Mom's authentic voice, generates a title, and allows review/editing before saving.
        - The journal serves as a lasting family keepsake and trains the AI over time (feeding into tomorrow's Morning Briefing without ever quizzing her short-term memory).
        - Dedicated in-page journal section displays all memories in chronological/recent order, with story titles, source badges (`Spoken on Kiosk`, `Voice Interview`, `Memory Note`), and collapsible spoken transcript toggles.
        - Includes a 1-click **"Download Markdown (.md)"** export button and clean **"Print / Save as PDF"** stylesheet.
    - **Clutter Elimination**: Removes duplicate "Scheduled for Today" events and separate fragmented alerts from the announcement card area, maintaining hidden DOM compatibility elements.
- Calendar, Appointments & Merged Upcoming US Holidays: Displays upcoming single-day and optional multi-day doctor visits, family visits, errands, and events (`date`, `endDate`, `category`: medical/family/errand/service/other, `location`: home/outing) chronologically woven together with the next 4 upcoming major US federal and cultural holidays, senior-friendly badges (`TODAY`, `TODAY • Thru ...`, `TOMORROW`, or date range), notes/driver details, an event-specific `reminder` field, inline appointment editing, and automatic past-event cleanup after the effective end date has passed.
- Contacts List & Birthdays: Automatically displays all active registered users alongside additional non-user contacts (managed by ADMIN and EDITOR roles), complete with relationship labels, plain text phone numbers, and birthdays (highlighting birthdays falling on today).
- Consolidated Contact & User Normalization: Centralized normalization utilities (`normalizeUserContact`, `normalizeContactRecord`, `syncCurrentUserContactToBoard`) eliminate duplicate boilerplate code across login, profile saves, user table administration, and contact rendering.
- Family Messages Manager: Supports posting, editing, and deleting messages stored under `board/messages/{id}`. Each message card displays the message text, author/user name (prefilled with logged-in user profile name), and formatted post date/time. Admins/editors can optionally set an expiration date; expired messages are automatically filtered out from the kiosk display while remaining visible in the admin list with an "Expired" badge. Clean canonical representation under `board/messages`; legacy transition string `board/reminders` has been removed and is automatically pruned from Firebase.
- Structured Medications Manager & Senior Notes: Supports adding, editing, and deleting individual medications stored under `board/medicationList/{id}` with specific medication name/dosage, schedule/timing badge (e.g. "Morning (8:00 AM)"), and dedicated instructions/notes textarea shown to the senior. A separate general medication instructions/notes textarea (`board/medicationNotes`) is displayed at the top of the senior's medication card. Clean canonical representation under `board/medicationList`; legacy transition multiline text `board/medications` has been removed and is automatically pruned from Firebase. Integrated into the AI Daily Companion synthesis prompts.
- Light, Mobile-First UI: High-contrast light color scheme (`bg-slate-100` background, `bg-white` cards, `blue-600` primary actions) with always-visible Main Message card, responsive mobile cards for user management, and 16px (`text-base`) inputs to prevent mobile browser zoom.
- 4-Tab Dedicated Admin & Editor Panel: Organized into 4 focused tabs to eliminate modal clipping and simplify mobile layout:
    - **Tab 1: Daily Updates (`#admin-tab-daily`)**: Today's Announcement, Family Messages, Medications & Health (with Taken checkbox and Publish button), and Scheduled Appointments & Events.
    - **Tab 2: Check-In & Memories (`#admin-tab-checkin`)**: Dedicated area for managing the Senior Daily Check-In, viewing today's response, clearing answers, configuring custom question/choice overrides (with "Suggest Ideas" bank), full in-page Story Catcher voice interview recording & AI polishing, and in-page chronological Mom's Memory Journal with Markdown and PDF export.
    - **Tab 3: AI & Board Settings (`#admin-tab-settings`)**: Caregiver Prep Rules, Caregiver Notes & Feedback for AI, optional Gemini API key, Board Title, Weather Zipcode, and Admin Card Ordering.
    - **Tab 4: Contacts & Users (`#admin-tab-people`)**: Contacts & Birthdays directory, User Profile, and Admin User Role Management.
- Medication Notification System: Browser push notifications, audio chime, and in-app alerts dispatched to editors and admins when medication is logged.
- Low-Vision & 80+ Senior Display Typography: All text elements across the kiosk display panel (#view-display) are optimized for seniors aged 80+ who are not wearing glasses: massive clock (up to 96px font-black), extra-large date (24-30px bold), prominent 48px announcement banner, 20-24px suggestions and daily check-in questions with tactile 18-20px response buttons, 24-30px medication button, 20-24px medication names, messages, appointments, and contacts with high-contrast bold weights, plus sub-pixel anti-aliasing and optimized legibility CSS.
- Medication Notification System: Browser push notifications, audio chime, and in-app alerts dispatched to editors and admins when medication is logged.
- Low-Vision & 80+ Senior Display Typography: All text elements across the kiosk display panel (#view-display) are optimized for seniors aged 80+ who are not wearing glasses: massive clock (up to 96px font-black), extra-large date (24-30px bold), prominent 48px announcement banner, 20-24px suggestions and daily check-in questions with tactile 18-20px response buttons, 24-30px medication button, 20-24px medication names, messages, appointments, and contacts with high-contrast bold weights, plus sub-pixel anti-aliasing and optimized legibility CSS.
