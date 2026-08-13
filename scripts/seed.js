// Loads data/tavasya-seed.json into the `compliances` collection.
// Safe to re-run: writes are keyed by `id`, so re-running overwrites
// the same 105 rows in place instead of duplicating them.
//
// Usage:
//   1. Firebase Console -> Project settings -> Service accounts
//      -> Generate new private key. Save it as service-account.json
//      in this scripts/ folder. DO NOT COMMIT THIS FILE — it grants
//      full admin access to your database, bypassing firestore.rules
//      entirely. Add "scripts/service-account.json" to .gitignore.
//   2. npm install firebase-admin
//   3. node scripts/seed.js

import { readFileSync } from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(__dirname, "service-account.json"), "utf8"));
const rows = JSON.parse(readFileSync(join(__dirname, "..", "data", "tavasya-seed.json"), "utf8"));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  console.log(`Seeding ${rows.length} compliance rows…`);
  let batch = db.batch();
  let n = 0;
  for (const row of rows) {
    const { id, ...data } = row;
    batch.set(db.collection("compliances").doc(id), data, { merge: true });
    n++;
    if (n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`Done. ${n} rows written.`);
  console.log(`Reminder: each row's ownerEmail is blank — assign owners from the Register tab, or edit the JSON before re-running.`);
}
run().catch((e) => { console.error(e); process.exit(1); });
