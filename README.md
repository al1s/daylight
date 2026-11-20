# Daylight — standalone edition

A symptom notebook for iPhone, tablet, and desktop browsers. The app is plain HTML, CSS, and JavaScript. It has no OpenAI API, ChatGPT sign-in code, subscription check, external scripts, analytics, database, or build dependency.

## Deploy

Upload the contents of this ZIP to an HTTPS static website. `index.html` must be at the site's document root. Keep the files together and retain their filenames.

### Cloudflare Pages: direct upload

1. Open your Cloudflare dashboard and go to Workers & Pages.
2. Create a Pages project using Direct Upload.
3. Upload this ZIP, or the extracted folder containing `index.html`.
4. Deploy and open the HTTPS address Cloudflare returns.

No build command or package installation is needed.

Official instructions: https://developers.cloudflare.com/pages/get-started/direct-upload/

### Your own hosting

Copy the files into the document root of an HTTPS site served by Nginx, Caddy, Apache, or another static web server. The app needs only static file delivery. It works at a site root or inside a subdirectory because its asset paths are relative.

Use a stable HTTPS address. The service worker for offline support requires HTTPS. Opening `index.html` directly from the iPhone Files app is not a reliable installation method.

Your hosting service controls access to the website. Without an access gate, anyone who knows the address can load the app, but each browser keeps its own separate diary. Hosting access controls do not create shared or synchronized diary storage.

## Install on iPhone

1. Open your new HTTPS address in Safari.
2. Tap Share, then Add to Home Screen.
3. If offered, leave Open as Web App enabled and tap Add.
4. Open Daylight from its new icon while online once to prepare offline files.
5. Use that installed app for future notes.

Safari and an installed Home Screen app can have separate storage. Install first, then import an existing diary into the installed app.

## Move existing diary entries

1. On the original installation, save any unfinished note.
2. Open Settings and choose Export backup.
3. Transfer the JSON backup to the destination device if necessary.
4. Open the new installation from its Home Screen icon.
5. Open Settings, choose Import backup, and select the JSON file.
6. Review the number of notes and confirm Merge notes.
7. Check Notebook to confirm your saved dates are present.

Stored notes belong to the browser and website origin. A new domain starts with a separate empty notebook until you import a backup. Signing into a hosting account does not synchronize diary entries. When merging backups, the more recently saved entry wins for matching dates; unrelated dates remain.

## Use

- Record nausea before breakfast and about 30–60 minutes afterward. Blank means unknown; 0 explicitly means no nausea.
- Add breakfast foods, portion, meal timing, nausea duration, pain severity/location/duration, fullness, bloating, heartburn, vomiting, bowel pattern, appetite, and effects on meals or school.
- Evening medication and period notes are optional. Medication fields record what happened; they do not give dosing instructions or send reminders.
- Save the note. Unsaved edits are retained as local drafts when browser storage is available.
- Notebook shows editable daily pages. Patterns uses saved notes only and calculates breakfast averages from paired scores on the same dates.
- Export a visit summary or CSV for review. Export a JSON backup to preserve or move the notebook.

## Storage and privacy

Diary entries are saved in browser localStorage. The application does not upload them to a server. The hosting provider still receives ordinary website requests when the page or its assets are loaded.

Use normal browsing for an ongoing diary. Private Browsing, clearing website data, or device storage management can remove local data. Keep occasional backups. Local notes and exported backup files are not encrypted by Daylight.

## Maintenance

- Keep the same HTTPS address when updating so existing local notes remain accessible.
- When replacing application files, change the `CACHE` version in `sw.js` so the updated offline files install.
- Retain the localStorage keys and backup schema in `diary-core.js` unless you also implement migration.
- Back up notes before a major app update.

## Developer verification

With Node.js available, run:

```sh
node --test tests/core.test.cjs
node --check app.js
node --check diary-core.js
node --check sw.js
```

The package includes the complete runtime source and nine data tests. Its runtime files match the tested published application. Actual iPhone installation, native iOS sharing, and offline reopening should be checked on the destination device.

## References

- iPhone installation: https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios
- Browser storage boundaries: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
- Offline service workers and HTTPS: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
