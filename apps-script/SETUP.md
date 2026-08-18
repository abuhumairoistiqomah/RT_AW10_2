# GOOGLE APPS SCRIPT BACKEND SETUP INSTRUCTIONS

Follow these steps to deploy the real Google Spreadsheet backend for the Rumah Tahfidz LMS:

## 1. Create a Google Spreadsheet
1. Open [Google Sheets](https://sheets.google.com) and create a new Spreadsheet.
2. Name it `Rumah Tahfidz LMS Database`.
3. Create the following 17 sheets with exact names:
   - `01_APP_CONFIG`
   - `02_LOOKUPS`
   - `03_MASTER_STUDENTS`
   - `04_MASTER_TEACHERS`
   - `05_MASTER_SURAHS`
   - `06_USERS`
   - `07_EVENTS`
   - `07A_EVENT_DAYS`
   - `08_SESSION_GROUPS`
   - `09_SESSION_CONFIG`
   - `10_HALAQAH`
   - `11_HALAQAH_TEACHERS`
   - `12_EVENT_PARTICIPANTS`
   - `13_SESSION_ASSESSMENTS`
   - `14_FINAL_EVALUATIONS`
   - `15_AUDIT_LOG`
   - `16_SESSIONS` (Headers: `session_token`, `user_id`, `role`, `teacher_id`, `created_at`, `last_seen_at`, `revoked`, `revoked_at`)

4. Copy the **Spreadsheet ID** from the Google Sheet URL:
   `https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID_HERE/edit`

---

## 2. Deploy Google Apps Script
1. In Google Sheets, click **Extensions** -> **Apps Script**.
2. Replace all content in `Code.gs` with the contents of `apps-script/Code.gs` from this project.
3. Click **Project Settings** (gear icon on the left sidebar).
4. Under **Script Properties**, click **Add script property**:
   - **Property**: `SPREADSHEET_ID` | **Value**: `YOUR_SPREADSHEET_ID_HERE`
   - **Property**: `AUTH_PEPPER` | **Value**: `YOUR_SECRET_PEPPER_STRING` (**REQUIRED** for password security)
5. Click **Save script properties**.

### Password Security & Setup
- Plaintext passwords are strictly rejected.
- Accounts in `06_USERS` require salted SHA-256 hashes in `password_hash`.
- To generate a hash for a user, run `generatePasswordHashForSetup("password")` in the Apps Script editor and copy the hash string from Execution Logs into `password_hash`.

---

## 3. Deploy as Web App
1. Click **Deploy** -> **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Configure the settings:
   - **Description**: `Rumah Tahfidz LMS API v1`
   - **Execute as**: `Me (your email)`
   - **Who has access**: `Anyone`
4. Click **Deploy**.
5. Grant the necessary permissions when prompted by Google.
6. Copy the **Web App URL**:
   `https://script.google.com/macros/s/AKfycbx.../exec`

---

## 4. Connect Frontend
1. Open `.env` or set environment variables in your deployment platform (Vercel / Cloud Run):
   ```env
   VITE_API_URL=https://script.google.com/macros/s/AKfycbzfLeDLKXwFMeaN-z0zyDmi7MdNX6WwK_l7bCfk5AwL_OF42-j5d1Mms5LE4p4B68Lb7Q/exec
   VITE_USE_MOCK_DATA=false
   ```
2. Restart or rebuild the frontend application.
3. Verify connection via the **Health Check** status or Database Connection badge in the app header.
