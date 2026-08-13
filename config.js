// ============================================================
//  EDIT THIS FILE — it is the only one you need to change.
//  Everything else works as-is.
// ============================================================

// 1. Your team's email domain. Only these addresses can sign in.
//    TESTING PHASE: using gmail.com so the author can test with a
//    personal address before this moves to Tavasya's own domain.
//    Anyone with a Gmail address can attempt sign-in, but only
//    people added to the `users` list in Firestore (Step 6) can
//    actually see or touch any data — see firestore.rules.
export const ORG_DOMAIN = "gmail.com";

// 2. Your Firebase project's config (from Firebase Console -> Project settings).
export const firebaseConfig = {
  apiKey: "AIzaSyCjflrRXRaxSe8AdBO48RaCmj8GMGREwoc",
  authDomain: "tavasya-compliance0.firebaseapp.com",
  projectId: "tavasya-compliance0",
  storageBucket: "tavasya-compliance0.firebasestorage.app",
  messagingSenderId: "253150864640",
  appId: "1:253150864640:web:2f25b94a0551f546e4bfe5"
};

// 3. Dropdown values used across the app.
export const OPTIONS = {
  schemes: [
    "TAVASYA SSF",
    "TAVASYA Mudrikaran Scheme II",
    "TAVASYA Mudrikaran Scheme III"
  ],
  frequencies: [
    "One-time", "Per valuation", "Ongoing", "Quarterly",
    "Half-yearly", "Annual", "Phased"
  ]
};
