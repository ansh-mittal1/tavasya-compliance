# Tavasya Compliance Register

A small site for one thing: every Tavasya compliance obligation, its due
date, its status, and a link to where you actually file it. You and your
teammates log in, see the same register, mark things done as you file
them. A scheduled script sends a daily digest email to whoever owns an
item once it's within 15 days of its due date — and keeps sending until
someone marks it complete.

No build step, no framework. Five files for the site, three for the
reminder job. You edit one of them (`config.js`).

- **Sign-in** — your @tavasya.fund email
- **Access** — two roles: Admin (manages the team + can delete rows) and Member (sees and edits everything else)
- **Hosting** — GitHub Pages, free
- **Data** — Firebase Firestore, free tier is far more than enough for this
- **Reminders** — GitHub Actions, once a day, free
- **Seed data** — the 105-row Tavasya register you already reviewed, ready to load in

---

## What you need

A Google account, a GitHub account, and — for the email piece specifically
— someone with admin rights on your Microsoft 365 tenant. About 45
minutes total, most of it the email setup.

---

## Step 1 — Create the Firebase project

1. Go to <https://console.firebase.google.com> and click **Add project**.
   Name it whatever you like. Google Analytics can stay off.
2. **Build → Firestore Database → Create database.** Production mode,
   region near you (`asia-south1` for India).
3. **Build → Authentication → Get started → Sign-in method → Email/Password**
   → turn on just that toggle, Save. Leave "Email link" off.

## Step 2 — Register the web app

1. Gear icon → **Project settings** → scroll to **Your apps** → click `</>`.
2. Give it a nickname, **Register app**. Copy the `firebaseConfig` block.
3. Open `config.js` in this repo and paste it in, and set your domain:

```js
export const ORG_DOMAIN = "tavasya.fund";
export const firebaseConfig = { ...pasted from Firebase... };
```

The API key is meant to be public — it identifies your project, it
doesn't grant access. Step 3 is what actually protects your data.

## Step 3 — Publish the security rules

1. Open `firestore.rules`. The domain is already set to `tavasya.fund`
   — only change it if that's not right.
2. Firebase → **Firestore Database → Rules** → delete what's there,
   paste the whole file in, **Publish**.

## Step 4 — Make yourself an Admin

1. Firebase → **Firestore Database → Data → Start collection**.
2. Collection ID: `users`. Document ID: **your email, lowercase** —
   e.g. `you@tavasya.fund`.
3. Add fields:

   | Field    | Type    | Value                |
   |----------|---------|----------------------|
   | `email`  | string  | `you@tavasya.fund`   |
   | `name`   | string  | `Your Name`          |
   | `role`   | string  | `admin`              |
   | `active` | boolean | `true`               |

4. Save. From here you add your teammates from the **Team** tab inside
   the app instead of doing this by hand again.

## Step 5 — Put it on GitHub Pages

1. New repository on GitHub (public is fine).
2. Upload every file in this folder, keeping the folder structure —
   `index.html`, `styles.css`, `app.js`, `config.js`, `firestore.rules`,
   `README.md`, and the `scripts/` and `.github/` folders.
3. Repo → **Settings → Pages** → Source: **Deploy from a branch**,
   branch `main`, folder `/ (root)` → Save.
4. Wait a minute. Live at `https://<your-username>.github.io/<repo-name>/`.

## Step 6 — Let Firebase trust that address

**Authentication → Settings → Authorised domains → Add domain** →
`<your-username>.github.io`.

Open the URL, sign in, add your teammates from **Team**.

---

## Loading the compliance data

`data/tavasya-seed.json` has all 105 rows from the register we built
together — obligation, scheme, frequency, due date, regulator — with
`ownerEmail` and `link` left blank for you to fill in.

1. Firebase → gear icon → **Project settings → Service accounts →
   Generate new private key.** Save the downloaded file as
   `scripts/service-account.json`.

   **This key bypasses `firestore.rules` completely — full admin
   access. Never commit it.** Add this line to a `.gitignore` file at
   the repo root before you push anything:
   ```
   scripts/service-account.json
   ```

2. `npm install firebase-admin`
3. `node scripts/seed.js`

It's safe to re-run — rows are keyed by ID, so a second run overwrites
the same 105 rows rather than duplicating them. If you want to change
what gets seeded, edit the JSON first.

Once it's in, open the app and fill in `Owner` and `Filing link` for
each row from the **Register** tab — that's most of what makes the
reminders and the ↗ links actually useful. The rest (dates, regulator,
notes) came from the calendar we already checked.

---

## Reminder emails — Microsoft Graph setup

This is the one part that needs your Microsoft 365 admin, because
sending mail from your tenant requires an app registration with
permission to do so. Nobody can automate this step for you — it needs
someone with admin rights actually clicking through it once.

### Create the app registration

1. <https://portal.azure.com> → **Azure Active Directory → App registrations
   → New registration.** Name it `Tavasya Compliance Reminders`. Leave
   the rest default → **Register**.
2. Copy the **Application (client) ID** and **Directory (tenant) ID**
   from the Overview page.
3. **Certificates & secrets → New client secret.** Copy the **Value**
   immediately — it's shown once.
4. **API permissions → Add a permission → Microsoft Graph → Application
   permissions** → search `Mail.Send` → add it.
5. Still on API permissions: **Grant admin consent for [your org]** —
   this button only works for someone with tenant admin rights.

### Pick the sending mailbox

Decide which mailbox the reminders come from — `compliance@tavasya.fund`
or your own address both work, since `Mail.Send` at the Application
level can send as any mailbox in the tenant. A dedicated shared mailbox
is worth setting up if you have one available, so replies and history
don't land in one person's personal inbox.

### Add the secrets to GitHub

Repo → **Settings → Secrets and variables → Actions → New repository
secret**, one at a time:

| Secret name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | The whole contents of `scripts/service-account.json`, pasted as one block |
| `MS_TENANT_ID` | From the app registration overview |
| `MS_CLIENT_ID` | From the app registration overview |
| `MS_CLIENT_SECRET` | The secret value you copied |
| `MS_SENDER_EMAIL` | The mailbox reminders send from |

### Test it

**Actions tab → Daily compliance reminders → Run workflow** to trigger
it manually without waiting for 9am. Check the run's log — it prints
who it sent to and how many items each got. "Nothing due — no mail
sent" is a valid, expected result on a quiet day.

Once that works, it runs itself daily at 9:00 IST. No further action.

---

## How it behaves

**Reminders start 15 days before a due date** by default — override
per row with `Reminder lead (days)` in the drawer. They repeat **every
day**, including after the due date passes (overdue items don't stop
being reminded, they escalate in the mail's colour coding), until
`Completed` is checked.

**Unowned items go to every Admin**, not nobody, so a compliance
without an assigned owner still gets chased rather than silently
missed.

**Marking complete is the only thing that stops a reminder.** There's
no date-based auto-complete — a due date passing does not mean a
filing happened, so the app never infers that for you.

**Ongoing / event-based obligations** (no fixed due date) never
trigger a reminder. Track those manually — they show under the
"Ongoing" status on the dashboard as a standing reminder they exist,
not as a nagging email.

---

## Adding a compliance, editing, deleting

Any signed-in teammate can add or edit a row from **Register → + Add
compliance**. Only an Admin can delete one — everyone else can mark it
complete instead, which is almost always what you actually want (it
keeps the filing history rather than erasing it).

## Team management

Only an Admin sees the **+ Add person** button and the role dropdown.
Removing someone's access keeps their name on whatever they'd already
filed — it just stops them signing in. Restoring is the same toggle.

---

## If something goes wrong

**"Missing or insufficient permissions"** — the rules aren't
published, or your `users` document ID isn't your email in lowercase,
or `active` was saved as the text `"true"` instead of the boolean
`true`.

**The confirmation email never arrives** — check spam (it's from
Firebase, not a familiar sender). Then check your GitHub Pages domain
is in Authorised domains (Step 6).

**Reminder emails aren't arriving** — check the Actions tab log first.
Common causes: admin consent wasn't actually granted (still shows
"Not granted" next to the permission in Azure), a secret name is
misspelled, or every item genuinely has a due date more than its lead
window away.

**Everything loads but the register looks empty** — you haven't run
`node scripts/seed.js` yet, or it ran against a different Firebase
project than the one `config.js` points to.

---

## What this costs

Nothing at this size. Firebase's free tier covers 50,000 reads a day —
a handful of people checking a 100-row register uses a few hundred.
GitHub Pages and GitHub Actions are both free for a repo this size.
The Microsoft Graph calls don't cost anything beyond your existing
Microsoft 365 licence.

## Where it goes next — Hyperion

This is built for Tavasya only, on purpose. When you're ready to add
Hyperion:

- Same Firebase project or a separate one — a separate project keeps
  the two funds' data fully apart, which is probably right if
  different people should see each.
- Either way, it's a second `config.js` / repo pointed at whichever
  project, reusing every other file unchanged, or a `fund` field added
  to each compliance document plus a fund filter in the Register tab
  if you'd rather keep both in one place. Worth deciding once you see
  how this one feels in daily use.
