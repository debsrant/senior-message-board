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
    - Make edits to `index.html` (or other project assets).
    - Test locally by opening `index.html` directly in a browser or serving it with a local web server (e.g. Live Server in VS Code or `npx serve`).
3. **Commit & Push Changes**:
    ```bash
    git add index.html project.md
    git commit -m "Update feature or content"
    git push origin main
    ```

### B. Hosting with GitHub Pages

The web application is hosted as a single-page app via GitHub Pages:

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
           "date": "2026-11-05",
           "time": "14:30",
           "notes": "Sarah is driving",
           "createdAt": 1700000001000,
           "createdBy": "Sarah"
         }
       },
       "reminders": "10:30 AM - Doctor appointment\n2:00 PM - Call Sarah",
       "medications": "Morning vitamins with breakfast\nBlood pressure pill at 8:00 AM",
       "medsTaken": false,
       "medsTakenTime": 0,
       "zipcode": "90210",
       "suggestSunny": "Great day for a short walk outside!",
       "suggestCloudy": "Perfect for some light bird watching.",
       "suggestRain": "Stay dry! Maybe call a friend today?",
       "suggestSnow": "Stay warm! Time for a hot cup of tea.",
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
      }
    }
  }
}
```

### E. Operating the Views
- **Two-Column Admin & Editor Panel Layout (Mobile-Responsive Light UI)**:
  - **Column 1 (Daily Board Content & Actions)**:
    1. **Today's Important Message / Announcement**: Enter a personalized message displayed at the top of the board.
    2. **Calendar Events & Appointments**: Schedule doctor visits, therapy, and family events with title, date, time, and driver/notes. Edit existing appointments inline or delete canceled events.
    3. **Publish Changes**: Large action button to instantly push updates to the tablet.
  - **Column 2 (Profile, Maintenance & Access Control)**:
    1. **My Profile (Admin & Editor)**: Display name, Firebase email, assigned role badge, and toggle for medication alerts.
    2. **Board Maintenance & Schedules (Admin & Editor)**: Update board title, reminders, medications, zipcode, custom weather suggestions, and reset medication check-off status. Includes **Display Card Order (Admin Only)** so `ADMIN` users can position **Daily Reminders**, **Medications**, and **Scheduled Events** into Position 1, Position 2, or Position 3.
    3. **User Management & Role Assignment (Admin Only)**: View registered users in real time, assign roles (`ADMIN`, `EDITOR`, `VIEWER`), pre-assign new users, and toggle users **Active / Inactive** to instantly revoke or restore access without deleting account data.
    *(Note: For users with the `EDITOR` role, the User Management card and Display Card Order controls are hidden, while Board Maintenance & Schedules remains fully accessible).*
- **Display View (Tablet & Phone)**:
  1. Sign in with the `VIEWER` credentials on the tablet.
  2. Both Admin and Editor management buttons are hidden.
  3. **Main Message Card (3-Column Today Hub)**: Displayed full-width at the top of the board below the clock & weather card using a 3-column layout on tablet/desktop (stacking vertically on phones):
     - **Column 1**: Today's Important Message.
     - **Column 2**: Scheduled for Today — automatically lists today's appointments or displays `"No events scheduled for today"` when empty so content positions never shift for the senior.
     - **Column 3**: Medication Check-In status banner and **"I TOOK MY MEDS"** action button.
  4. **Positionable 3-Column Section (Reminders, Medications & Scheduled Events)**: Displays **Daily Reminders**, **Medications** (simplified medication information panel), and **Appointments & Events** in a 3-column grid on tablet/desktop (stacking on phones), ordered dynamically according to the Admin's chosen positions (Position 1, 2, 3).
  5. Senior taps **"I TOOK MY MEDS"** in the Main Message section to log their medication, updating Firebase and notifying subscribed caregivers.

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

### B. Weather & Geocoding Services

The board displays local weather and daily activity suggestions using two public, keyless APIs:

1. **OpenStreetMap Nominatim API**:
    - Converts the caregiver-entered US ZIP code into latitude and longitude coordinates.
    - Endpoint: `https://nominatim.openstreetmap.org/search?postalcode={zip}&country=US&format=json`
    - No API key is required. Ensure respectful request frequencies (requests are triggered only when the ZIP code updates).
2. **Open-Meteo Weather API**:
    - Fetches current temperatures, daily highs/lows, and weather condition codes.
    - Endpoint: `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=auto&temperature_unit=fahrenheit`
    - Open-source, free for non-commercial use, and requires no API key.

### C. Future Third-Party Integrations

If adding fee-based or sensitive third-party services in the future (e.g., Twilio for SMS alerts to family when medications are taken, OpenAI for generating dynamic reminders, or paid weather APIs):

- **Do not** put secret API keys directly into `index.html`.
- Use a serverless backend such as **Firebase Cloud Functions** to securely hold secret keys in environment secrets and handle server-to-server calls.
