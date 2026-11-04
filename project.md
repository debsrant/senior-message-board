# Project Instructions

This document provides setup and operational instructions for each product and service used in the **Senior Message Board** project.

---

## 1. GitHub

GitHub serves as the version control platform, codebase repository, and hosting service (via GitHub Pages).

### A. Repository & Version Control

1. **Clone the Repository**:
    ```bash
    git clone https://github.com/debsrant/senior-message-board.git
    cd senior-message-board
    ```
2. **Local Development Workflow**:
    - Make edits to `index.html`, `app.js`, or `styles.css`.
    - Test locally by opening `index.html` directly in a browser or serving it with a local web server (e.g. Live Server in VS Code or `npx serve`).
3. **Commit & Push Changes**:
    ```bash
    git add index.html app.js styles.css project.md
    git commit -m "Update feature or content"
    git push origin main
    ```

### B. Hosting with GitHub Pages

The web application is hosted as a clean, modular zero-build static application via GitHub Pages:
- `index.html`: Clean, semantic HTML layout (~1,100 lines) structure.
- `styles.css`: Custom scrollbars, kiosk tap rules, and print stylesheet.
- `app.js`: Client-side JavaScript containing Firebase integration, real-time board listeners, UI rendering, AI engines, and centralized contact normalization.

1. Go to the repository on GitHub: `https://github.com/debsrant/senior-message-board`.
2. Navigate to **Settings** > **Pages** (under the "Code and automation" sidebar).
3. Under **Build and deployment**:
    - **Source**: Select `Deploy from a branch`.
    - **Branch**: Select `main` and set folder to `/ (root)`.
    - Click **Save**.
4. GitHub Pages will build and deploy the site. The live URL will be available at:
    ```
    https://debsrant.github.io/senior-message-board/
    ```
5. Any updates pushed to the `main` branch will automatically re-deploy within minutes.

### C. Access Control & Collaboration

- Under **Settings** > **Collaborators**, grant access to any family members or caregivers who will contribute code or documentation.
- For open or multi-contributor repos, configure branch protection rules on `main` to require pull requests.

---

## 2. Firebase

Firebase provides the backend infrastructure: **Firebase Authentication** for user accounts and **Firebase Realtime Database (RTDB)** for instant two-way synchronization between family admin devices and the display tablet.

### A. Firebase Console & Project Setup

1. Log in to the [Firebase Console](https://console.firebase.google.com/).
2. Select or create your Firebase project (e.g., `seniormessageboard`).
3. Under **Project Overview** > **Project Settings** > **General**:
    - In the **Your apps** section, register a **Web App** (or select the existing one).
    - Copy the `firebaseConfig` object and ensure it is updated in `index.html`:
        ```javascript
        const firebaseConfig = {
        	apiKey: 'YOUR_API_KEY',
        	authDomain: 'seniormessageboard.firebaseapp.com',
        	databaseURL: 'https://seniormessageboard-default-rtdb.firebaseio.com',
        	projectId: 'seniormessageboard',
        	storageBucket: 'seniormessageboard.firebasestorage.app',
        	messagingSenderId: '431774663721',
        	appId: 'YOUR_APP_ID',
        };
        ```

### B. Authentication Setup & User Roles
1. Go to **Build** > **Authentication** > **Sign-in method**.
2. Enable **Email/Password** provider (leave Email link passwordless sign-in disabled).
3. Create accounts under the **Users** tab:
   - **Admin Account**: Used by primary caregivers on phones/PCs for full control over board configuration, medication schedules, reminders, settings, and user profiles.
   - **Editor Account**: Used by family members and loved ones to post daily messages/announcements to the board, customize their personal user profile, and receive medication alerts.
   - **Viewer / Tablet Account**: Dedicated login used by the senior's tablet display kiosk.
4. Copy the unique **User UID** for each account created.

### C. Realtime Database Schema & Setup
1. Go to **Build** > **Realtime Database** and create a database (select your preferred region).
2. Set up the two primary data nodes:
   - `board`: Stores the display content and state.
     ```json
     {
       "boardTitle": "Grandma's Daily Board",
       "announcement": "Good morning! Have a wonderful day.",
       "events": {
         "evt_1700000001": {
           "title": "Dr. Miller - Eye Exam",
           "category": "medical",
           "location": "outing",
           "date": "2026-11-05",
           "endDate": "",
           "time": "14:30",
           "notes": "Sarah is driving",
           "reminder": "Bring sunglasses and your current glasses",
           "createdAt": 1700000001000,
           "createdBy": "Sarah"
         }
       },
       "messages": {
         "msg_1700000001": {
           "id": "msg_1700000001",
           "text": "Good morning Grandma! Sarah and I are stopping by at 3:00 PM.",
           "author": "Sarah",
           "authorUid": "user_sarah_uid",
           "createdAt": 1700000001000,
           "updatedAt": 1700000001000,
           "expirationDate": "2026-11-10"
         }
       },
       "medicationNotes": "Morning pills are in the blue organizer on the kitchen counter.",
       "medicationList": {
         "med_1": {
           "id": "med_1",
           "name": "Lisinopril 10mg",
           "time": "Morning (8:00 AM)",
           "notes": "Take 1 pill with a full glass of water. Don't take on an empty stomach.",
           "createdAt": 1700000001000
         },
         "med_2": {
           "id": "med_2",
           "name": "Calcium & Vitamin D",
           "time": "With Lunch",
           "notes": "Take with food.",
           "createdAt": 1700000002000
         }
       },
       "medsTaken": false,
       "medsTakenTime": 0,
       "zipcode": "90210",
        "cardPositions": {
          "messages": 1,
          "medications": 2,
          "events": 3,
          "contacts": 4
        },
       "updatedAt": 1700000000000
     }
     ```
   - `users/{uid}`: Maps user UIDs to user profiles, roles, and notification subscriptions:
     - For admin accounts:
       ```json
       {
         "displayName": "Primary Caregiver",
         "role": "ADMIN",
         "notifyOnMeds": true
       }
       ```
     - For editor accounts (family members):
       ```json
       {
         "displayName": "Sarah",
         "role": "EDITOR",
         "notifyOnMeds": true
       }
       ```
     - For the tablet display account:
       ```json
       {
         "displayName": "Kitchen Tablet Display",
         "role": "VIEWER",
         "notifyOnMeds": false
       }
       ```

### D. Security Rules
Navigate to **Realtime Database** > **Rules** and apply security rules ensuring:
- Only authenticated and active (`active !== false`) users can read the board.
- Users with `ADMIN` and `EDITOR` roles can update board contents (announcements, calendar events, reminders, medications, zipcode, weather suggestions).
- Users with `ADMIN` role can view and manage registered users (`/users`) including role assignments and active/inactive status toggling.
- Users with `VIEWER` role can log medication completion (`medsTaken` and `medsTakenTime`).
- Users can read and update their own profile settings under `users/$uid` (display name, notification preferences).

Example rules:
```json
{
  "rules": {
    "users": {
      ".read": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'ADMIN' && root.child('users').child(auth.uid).child('active').val() !== false",
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || (root.child('users').child(auth.uid).child('role').val() === 'ADMIN' && root.child('users').child(auth.uid).child('active').val() !== false))",
        ".write": "auth != null && (auth.uid === $uid || (root.child('users').child(auth.uid).child('role').val() === 'ADMIN' && root.child('users').child(auth.uid).child('active').val() !== false))"
      }
    },
    "board": {
      ".read": "auth != null && root.child('users').child(auth.uid).child('active').val() !== false",
      ".write": "auth != null && root.child('users').child(auth.uid).child('active').val() !== false && (root.child('users').child(auth.uid).child('role').val() === 'ADMIN' || root.child('users').child(auth.uid).child('role').val() === 'EDITOR')",
      "medsTaken": {
        ".write": "auth != null && root.child('users').child(auth.uid).child('active').val() !== false"
      },
      "medsTakenTime": {
        ".write": "auth != null && root.child('users').child(auth.uid).child('active').val() !== false"
      },
      "seniorResponse": {
        ".write": "auth != null && root.child('users').child(auth.uid).child('active').val() !== false"
      },
      "seniorHistory": {
        ".write": "auth != null && root.child('users').child(auth.uid).child('active').val() !== false"
      }
    }
  }
}
```

### E. Operating the Views
- **3-Tab Admin & Editor Panel Layout (Eliminating Scroll Fatigue)**:
  - **Tab 1: `📅 Daily Updates` (Default Tab)**:
    1. **Today's Important Message / Announcement**: Enter a personalized message displayed at the top of the board.
    2. **Family Messages Manager**:
       - Post, edit, and delete messages for the senior.
       - Each message displays the author/user name (prefilled by default with the logged-in user's profile name) and post date/time.
       - Caregivers can specify an optional expiration date; messages past their expiration date are automatically hidden from the kiosk display while remaining visible in the admin list with an "Expired" indicator.
    3. **Medications & Senior Daily Check-In**:
       - **General Medication Instructions & Notes**: Provide a general note/instruction (e.g., pillbox location or organizer details) displayed prominently at the top of the senior's medication card.
       - **Individual Medications Manager**: Add, edit, and delete individual medications with specific name/dosage, schedule/timing badge (e.g. "Morning (8:00 AM)", "With Breakfast"), and a dedicated instructions/notes textarea shown clearly to the senior.
       - **Senior Daily Check-In**: View the senior's latest check-in response and recent feedback history (with a button to clear/reset it), configure custom check-in questions or allow the AI to generate dynamic context-aware questions learning from the senior's recent feedback, and reset the "Medications Taken Today" check-off status, with a prominent **Publish Changes Instantly** button right below.
    4. **Appointments & Events**: Schedule single-day or optional multi-day doctor visits, therapy, and family events with title, start date (`date`), optional end date (`endDate`), time, driver/notes, and an **Event Reminders / Prep Advice** field (`reminder`, displayed on event cards and automatically incorporated into the AI Daily Companion summaries). Edit existing appointments inline or delete canceled events.
  - **Tab 2: `🤖 AI & Board Settings`**:
    1. **AI Daily Companion, Prep Rules & Caregiver Tone/Feedback (Admin & Editor)**: Configure caregiver `Keyword: Instruction` preparation rules (e.g., *"Infusion: Drink 2-3 extra glasses of water each day starting 3 days before a scheduled infusion"*), provide direct feedback on AI tone, senior likes/dislikes (e.g. prefers decaf coffee, likes jigsaw puzzles, dislikes frequent walking tips), and optionally provide a Gemini API key (saved locally on the caregiver's device) to synthesize the board using **Gemini 3.8 Flash (`gemini-3.8-flash`)** via the Gemini Interactions API, or use the built-in Smart Care Companion engine. Summaries update automatically whenever the board changes.
    2. **Board Title, Weather & Layout**: Update the board title, weather ZIP code, and **Display Card Order (Admin Only)** so `ADMIN` users can position **Messages**, **Medications**, **Appointments & Events**, and **Contacts List** into Position 1 through Position 4.
  - **Tab 3: `👥 Contacts, Profile & Users`**:
    1. **Contacts & Birthdays (Admin & Editor)**: Add, edit, or delete additional contacts who are not registered users (with name, relationship/role, phone number, and birthday). Active registered users are automatically included on the Contacts List card.
    2. **My Profile (Admin & Editor)**: Display name, phone number, relationship/label, birthday, Firebase email, assigned role badge, and toggle for medication alerts.
    3. **User Management & Role Assignment (Admin Only)**: View registered users in real time, assign roles (`ADMIN`, `EDITOR`, `VIEWER`), set or update user birthdays, pre-assign new users (including birthday), and toggle users **Active / Inactive** to instantly revoke or restore access without deleting account data.
    *(Note: For users with the `EDITOR` role, the User Management card and Display Card Order controls are hidden).*
- **Display View (Tablet & Phone — Streamlined Morning Action Header & 2-Column Hub)**:
  1. Sign in with the `VIEWER` credentials on the tablet.
  2. Both Admin and Editor management buttons are hidden.
  3. **Clock, Weather & Morning Action Header**: Full-width top header containing Date & Time on the left, Weather Widget in the center, and a **simplified Medication Check-In** on the right:
     - Prominent, high-contrast **"💊 I TOOK MY MEDS"** button when action is required.
     - Automatically transforms into a calm, reassuring **"✅ Meds Logged"** state with timestamp ("Logged today at 8:30 AM") and badge once logged, eliminating redundant warning boxes.
  4. **Main Message & Daily Companion Hub (`#card-announcement`) (Spacious 2-Column Layout)**:
     - **Column 1 (`📣 Today's Message & Suggestions`)**: Displays the caregiver's personalized daily announcement in large, comforting typography when present—and **automatically hides completely when empty** so no placeholder takes up screen space. Directly underneath, displays conversational AI daily suggestions (`#disp-ai-today-plan`) formatted into 2 concise paragraphs written in a natural family voice, followed by an interactive **Daily Check-In** (`#disp-senior-checkin-section`) with AI-generated or custom questions (zero icons/emojis). Responses sync to Firebase for family to see, and are remembered by the AI to continuously adapt and personalize future plans.
     - **Column 2 (`📅 Scheduled for Today & Health Prep`)**: Displays today's appointments, major US holidays, and birthdays (with `#today-events-count-badge`), followed by proactive multi-day prep advice (`#disp-ai-prep-alerts`) and the pacing look-ahead (`#disp-ai-look-ahead`).
  5. **Positionable 4-Card Reminders & Messages Section (1 Column on Phones, 2 Columns on Tablets, 3 Columns on Larger Screens)**: Displays **Messages** (family messages displaying message text, author name, and formatted post date, with automatic expiration filtering), **Medications** (structured medication cards displaying general caregiver instructions at the top, individual medication cards with names, schedule badges, and specific instructions/notes to show the senior), **Appointments & Events** (which automatically weaves upcoming major US holidays chronologically into the upcoming appointments list with holiday emojis and countdown badges), and **Contacts List** in a responsive grid (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`, with card height `max-h-[22.5rem] sm:max-h-96` and internal scrolling), ordered dynamically according to the Admin's chosen positions (Position 1 through Position 4).
  6. **Entry Count Badges on All Scrollable Cards**: Every scrollable card (**Scheduled for Today**, **Messages**, **Medications**, **Appointments & Events**, and **Contacts List**) automatically displays a badge indicating the number of entries (`1 Message` / `N Messages`, `1 Med` / `N Meds`, etc.) when entries exist—and hides the badge when empty—so the senior knows at a glance how many items are inside each scrollable card.
  7. Senior taps **"💊 I TOOK MY MEDS"** in the top header to log their medication, updating Firebase and notifying subscribed caregivers.

---

## 3. Kiosk Browser

A dedicated kiosk browser (such as **Fully Kiosk Browser & Launcher** on Android) locks down the tablet to run the message board continuously in full-screen mode without senior intervention.

### A. Tablet Preparation

1. Mount the Android tablet in an accessible, visible location (e.g., kitchen counter or bedside table).
2. Connect the tablet to continuous power via its charging cable.
3. Connect to a reliable Wi-Fi network.

### B. Installing & Configuring Fully Kiosk Browser

1. Install **Fully Kiosk Browser & Launcher** from the Google Play Store (or download the APK from the official website).
2. Launch Fully Kiosk Browser and grant required permissions (overlay, system settings, accessibility if requested).
3. Open the Fully Kiosk Settings menu (swipe from left edge or tap back button repeatedly, default PIN if set).
4. Configure the following settings:
    - **Web Zoom and Scaling**:
        - **Start URL**: Enter the GitHub Pages URL (e.g., `https://debsrant.github.io/senior-message-board/`).
        - **Enable Zoom**: Off (or adjust default zoom if text needs to be even larger).
        - **View Mode**: Desktop mode or standard mobile depending on screen resolution.
    - **Device Management & Boot**:
        - **Launch on Boot**: Enable (starts the message board immediately if the tablet restarts or powers on).
        - **Restart Browser on Crash**: Enable.
    - **Power & Screen Settings**:
        - **Keep Screen On**: Enable while plugged in / on AC power.
        - **Screen Off Timer / Sleep Schedule**: Optional - configure sleep hours (e.g., 10:00 PM to 7:00 AM) or use ambient light/motion detection to dim the display at night.
    - **Kiosk Mode (Lockdown)**:
        - **Enable Kiosk Mode**: Enable to lock down the interface.
        - **Kiosk PIN**: Set a secure numeric PIN known only to caregivers to prevent accidental exits.
        - **Disable Status Bar**: Enable (hides notifications and top status bar).
        - **Disable Navigation Bar**: Enable (hides Android back/home/recent buttons).
        - **Block Hardware Keys**: Enable (disables volume/power exit shortcuts).

### C. First-Time Tablet Login

1. Before locking into Kiosk Mode, load the Start URL.
2. Sign in using the `VIEWER` account credentials.
3. Verify that the **Display View** loads correctly and that the **Admin** button is not visible.
4. Test tapping **"I TOOK MY MEDS"** to ensure database connectivity.
5. Activate Kiosk Mode and lock settings.

---

## 4. API Keys & External Services

This project relies on external APIs for authentication, database synchronization, and local weather forecasting.

### A. Firebase Web API Key Management

The `apiKey` in `firebaseConfig` is a client identifier used by the Firebase JavaScript SDK to identify your project with Google Cloud services:

1. **Google Cloud Console Restrictions**:
    - Go to [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials).
    - Find the **Browser key (auto-created by Firebase)** matching your `apiKey`.
    - Under **Application restrictions**:
        - Select **Websites**.
        - Add allowed referrers:
            - `https://debsrant.github.io/*` (production URL)
            - `http://localhost:*` (for local development/testing)
    - Under **API restrictions**:
        - Select **Restrict key**.
        - Check only the services required by the app:
            - **Identity Toolkit API** (Firebase Auth)
            - **Firebase Realtime Database API**
            - **Token Service API**
    - Save changes.
2. **Credential Safety**:
    - Never embed Firebase Service Account private keys or admin SDK credentials in client-side HTML or push them to GitHub. The client SDK only requires the public web config.

### B. Weather, Geocoding & US Holidays Services

The board displays local weather and upcoming major US holidays using public, keyless APIs:

1. **OpenStreetMap Nominatim API**:
    - Converts the caregiver-entered US ZIP code into latitude and longitude coordinates.
    - Endpoint: `https://nominatim.openstreetmap.org/search?postalcode={zip}&country=US&format=json`
    - No API key is required. Ensure respectful request frequencies (requests are triggered only when the ZIP code updates).
2. **Open-Meteo Weather API**:
    - Fetches current temperatures, daily highs/lows, hourly temperature curves (morning 8–11 AM, afternoon peak 12–4 PM, evening wind-down 5–9 PM), precipitation probabilities, and computes the best outdoor/fresh air window.
    - Endpoint: `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true&hourly=temperature_2m,precipitation_probability,weathercode&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode&timezone=auto&temperature_unit=fahrenheit`
    - Open-source, free for non-commercial use, and requires no API key.
3. **Nager.Date Public Holidays API**:
    - Fetches upcoming US public holidays (`https://date.nager.at/api/v3/NextPublicHolidays/US`) and merges them with the built-in US cultural holiday calendar. Requires no API key.

### C. Gemini AI API Key (Optional — Admin & Editor Devices Only)

The **AI Daily Companion & Action Plan** section (`#card-ai-summary`) includes a built-in **Smart Care Companion** engine that works out-of-the-box with **zero API keys required**. If you want to use Google's **Gemini 3.8 Flash (`gemini-3.8-flash`)** model to write custom generative summaries, follow these guidelines:

1. **Should I add the Gemini API key on the Kiosk Tablet?**
    - **No.** You do **not** need to enter the Gemini API key on the senior's kiosk tablet, for two reasons:
      1. The kiosk tablet is signed in as a `VIEWER` user, which does not display the Admin/Editor panel.
      2. When an `ADMIN` or `EDITOR` generates an AI Action Plan (or publishes edits with a Gemini key saved on their phone or computer), the generated summary is saved directly to Firebase Realtime Database (`board/aiSummary`) and pushed to the kiosk tablet in real time.
      3. For live day-to-day changes on the tablet (such as when the senior taps **"I TOOK MY MEDS"**, when the day rolls over at midnight, or when live weather updates), the built-in Smart Care Companion engine on the tablet updates the summary automatically without needing a Gemini key.
2. **Do I use a different API key than the Firebase `apiKey`?**
    - **Yes — always use a separate API key.**
      - **Firebase `apiKey` (in `firebaseConfig`)**: This key is embedded in `index.html` and restricted in Google Cloud Console strictly to Firebase services (*Identity Toolkit API*, *Firebase Realtime Database API*, and *Token Service API*). It should **not** have the Generative Language API enabled on it because `index.html` is public on GitHub Pages.
      - **Gemini API Key**: Create a separate key in **Google AI Studio** (or in a separate Google Cloud project) specifically for calling the Gemini API (`generativelanguage.googleapis.com`).
3. **Step-by-Step Process to Set Up the Gemini API Key**:
    1. **Generate a Key in Google AI Studio**:
        - Sign in to [Google AI Studio](https://aistudio.google.com/apikey) with your Google account.
        - Click **Create API key** (Google AI Studio offers a generous free tier for `gemini-3.8-flash`, which is more than enough for daily family board updates).
        - Copy the generated key (starts with `AIza...`).
    2. **(Optional) Restrict the Key in Google Cloud Console**:
        - In [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials), locate your new Gemini API key.
        - Under **Application restrictions**, select **Websites** and add `https://debsrant.github.io/*` and `http://localhost:*`.
        - Under **API restrictions**, select **Restrict key** and enable **Generative Language API** only.
    3. **Enter the Key on Your Admin/Editor Phone or Computer**:
        - Log in to the Senior Message Board as an `ADMIN` or `EDITOR` user and open the **Admin / Post Message** panel.
        - Scroll to **AI Daily Action Plan & Prep Rules** in Column 1.
        - Paste your Gemini API key into the **Optional Gemini API Key (Saved on This Device Only)** field (`#input-gemini-api-key`).
        - Click **Generate Action Plan Now** (or **Publish All Changes to Board**).
    4. **How the Key is Stored Securely**:
        - The key is saved **only in your browser's `localStorage`** (`smb_gemini_api_key`) on that Admin/Editor device.
        - It is **never** written to `index.html`, **never** committed to GitHub, and **never** stored in the Firebase database.

### D. Future Third-Party Integrations

If adding other fee-based or server-side third-party services in the future (e.g., Twilio for SMS alerts to family when medications are taken, or paid weather APIs):

- **Do not** put secret API keys directly into `index.html`.
- Use browser-local storage on caregiver devices or a serverless backend such as **Firebase Cloud Functions** to hold secret keys and handle server-to-server calls.
