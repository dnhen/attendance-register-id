CADET ATTENDANCE ID WEB APP - VERSION 2.3.3-ID

PURPOSE
This is the ID-based Attendance Register. QR codes must contain only a numeric cadet ID, for example: 123456. If a cadet arrives without a QR code and does not know their ID, staff may type the cadet name manually.

FEATURES
- Rear-camera QR scanning on iPhone, iPad and compatible Android devices
- QR contents expected as digits only
- Vibration and a short audible confirmation (ding) on every successful QR scan
- Manual entry accepts either a numeric cadet ID or a cadet name
- Manually entered names are clearly marked in the on-screen attendance list
- Duplicate ID detection and duplicate manual-name detection
- Chronological or ID/name sorting
- Present count
- Home Training Parade and Other Activity types
- PCF checkbox for Other Activity records, including manual-name records
- Activity resume logic for sessions reopened within two hours
- Activity Closed mode
- Past activity viewing
- Delete one completed activity or delete all completed activities
- CSV export
- Offline app shell after the first successful online load

CSV FORMAT
The CSV export is a single line of comma-separated cadet IDs only, in arrival order, with no header row. Manually entered names (which have no numeric ID) are excluded from the export, since there is no ID for staff to reconcile against the register.

Example:
123456,123789,129034,120495

DEPLOYMENT
Upload all files in this folder directly to the root of the GitHub repository:
Attendance-Register-ID

Enable GitHub Pages from the main branch and /(root).
The expected web app URL is:
https://dnhen.github.io/attendance-register-id/

IMPORTANT
This ID version uses its own localStorage key and does not read or alter the name-based app's attendance records.
Attendance data is stored locally in the browser on each device. Export required CSV files before deleting activities or clearing website data.
