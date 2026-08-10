CADET ATTENDANCE ID WEB APP - VERSION 2.3.1-ID

PURPOSE
This is the ID-only alternative to the name-based Attendance Register.
QR codes must contain only a numeric cadet ID, for example: 123456

FEATURES
- Rear-camera QR scanning on iPhone, iPad and compatible Android devices
- QR contents expected as digits only
- Manual numeric ID entry
- Duplicate ID detection
- Chronological or ID-number sorting
- Present count
- Home Training Parade and Other Activity types
- PCF checkbox for Other Activity records
- Activity resume logic for sessions reopened within two hours
- Activity Closed mode
- Past activity viewing
- Delete one completed activity or delete all completed activities
- CSV export
- Offline app shell after the first successful online load

CSV FORMAT
Home Training Parade:
ID,Arrival Date,Arrival Time,Entry Method

Other Activity:
ID,Arrival Date,Arrival Time,Entry Method,PCF

DEPLOYMENT
Upload all files in this folder directly to the root of the GitHub repository:
Attendance-Register-ID

Enable GitHub Pages from the main branch and /(root).
The expected web app URL is:
https://mrqueeg.github.io/Attendance-Register-ID/

IMPORTANT
This ID version uses its own localStorage key and does not read or alter the name-based app's attendance records.
Attendance data is stored locally in the browser on each device. Export required CSV files before deleting activities or clearing website data.
