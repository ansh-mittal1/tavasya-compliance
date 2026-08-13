import { ORG_DOMAIN, firebaseConfig, OPTIONS } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, signOut, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, reload
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc,
  deleteDoc, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ============================ setup ============================ */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);
const state = { user: null, profile: null, compliances: [], team: [], editingId: null };
const isAdmin = () => state.profile && state.profile.role === "admin";

/* ============================ date helpers ============================ */
const pad = (n) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const daysBetween = (isoDate) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const [ty, tm, td] = todayISO().split("-").map(Number);
  const t = new Date(ty, tm - 1, td);
  return Math.round((due - t) / 86400000);
};
const fmtDay = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function statusOf(c) {
  if (c.completed) return "DONE";
  if (!c.dueDate) return "ONGOING";
  const d = daysBetween(c.dueDate);
  if (d < 0) return "OVERDUE";
  if (d <= (c.reminderLeadDays || 15)) return "DUE SOON";
  return "UPCOMING";
}
const statusClass = (s) => s.replace(" ", "");

/* ============================ view switching ============================ */
function showView(id) {
  ["view-auth", "view-verify", "view-notsetup", "view-app"].forEach((v) => { $(v).hidden = v !== id; });
}

/* ============================ auth ============================ */
function authMessage(e) {
  const map = {
    "auth/invalid-email": "That doesn't look like a valid email address.",
    "auth/wrong-password": "That password doesn't match. Use 'Set or reset my password' if you've forgotten it.",
    "auth/invalid-credential": "That email and password don't match. Use 'Set or reset my password' if you've forgotten it.",
    "auth/too-many-requests": "Too many tries. Wait a few minutes and try again.",
    "auth/weak-password": "Passwords need at least six characters.",
    "auth/email-already-in-use": "That password doesn't match. Use 'Set or reset my password' if you've forgotten it.",
    "auth/operation-not-allowed": "Password sign-in isn't switched on for this project yet.",
    "auth/network-request-failed": "Couldn't reach the server. Check your connection."
  };
  return map[e.code] || e.message || "Something went wrong. Try again.";
}

$("form-auth").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("auth-email").value.trim().toLowerCase();
  const password = $("auth-password").value;
  const err = $("auth-error");
  err.hidden = true;

  if (!email.endsWith("@" + ORG_DOMAIN)) {
    err.textContent = `Use your @${ORG_DOMAIN} account.`;
    err.hidden = false;
    return;
  }
  if (!password) {
    err.textContent = "Enter your password.";
    err.hidden = false;
    return;
  }

  $("btn-auth").disabled = true;
  try {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e1) {
      // Firebase's email-enumeration protection means a wrong password on
      // an EXISTING account throws the exact same code (auth/invalid-credential)
      // as a brand-new email would. We can't tell them apart from the code
      // alone — we have to actually attempt account creation and see which
      // way it fails.
      if (["auth/user-not-found", "auth/invalid-credential"].includes(e1.code)) {
        try {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          await sendEmailVerification(cred.user);
        } catch (e3) {
          if (e3.code === "auth/email-already-in-use") {
            // The account was real all along — it was just the wrong password.
            err.textContent = "That password doesn't match. Use 'Set or reset my password' if you've forgotten it.";
            err.hidden = false;
          } else {
            err.textContent = authMessage(e3);
            err.hidden = false;
          }
        }
      } else {
        throw e1;
      }
    }
  } catch (e2) {
    err.textContent = authMessage(e2);
    err.hidden = false;
  } finally {
    $("btn-auth").disabled = false;
  }
});

$("btn-reset").addEventListener("click", async () => {
  const email = $("auth-email").value.trim().toLowerCase();
  const err = $("auth-error");
  if (!email) { err.textContent = "Enter your email first, then tap this again."; err.hidden = false; return; }
  try {
    await sendPasswordResetEmail(auth, email);
    err.textContent = "Reset link sent — check your inbox.";
    err.hidden = false;
  } catch (e) {
    err.textContent = e.message || "Couldn't send that.";
    err.hidden = false;
  }
});

const doSignOut = () => { if (confirm("Sign out of Tavasya Compliance?")) signOut(auth); };
$("btn-reload").addEventListener("click", async () => {
  await reload(auth.currentUser);
  boot();
});
$("btn-signout-verify").addEventListener("click", doSignOut);
$("btn-signout-notsetup").addEventListener("click", doSignOut);
$("btn-signout").addEventListener("click", doSignOut);

onAuthStateChanged(auth, () => boot());

async function boot() {
  $("boot-splash").hidden = true;

  const user = auth.currentUser;
  if (!user) { state.user = null; state.profile = null; showView("view-auth"); return; }
  state.user = user;

  const email = (user.email || "").toLowerCase();
  if (!email.endsWith("@" + ORG_DOMAIN)) {
    await signOut(auth);
    const err = $("auth-error");
    err.textContent = `Use your @${ORG_DOMAIN} account. ${email} isn't on that domain.`;
    err.hidden = false;
    showView("view-auth");
    return;
  }

  if (!user.emailVerified) {
    $("verify-email").textContent = user.email;
    showView("view-verify");
    return;
  }

  const snap = await getDoc(doc(db, "users", user.email.toLowerCase()));
  if (!snap.exists() || snap.data().active !== true) {
    $("notsetup-email").textContent = user.email;
    showView("view-notsetup");
    return;
  }
  state.profile = snap.data();
  $("who-name").textContent = `${state.profile.name || user.email} · ${isAdmin() ? "Admin" : "Member"}`;
  $("btn-add-person").hidden = !isAdmin();
  $("btn-import").hidden = !isAdmin();

  await Promise.all([loadCompliances(), loadTeam()]);
  populateSchemeOptions();
  renderDashboard();
  renderRegister();
  renderTeam();
  showView("view-app");
}

/* ============================ tabs ============================ */
$("main-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + btn.dataset.tab));
});

/* ============================ data loading ============================ */
async function loadCompliances() {
  const snap = await getDocs(collection(db, "compliances"));
  state.compliances = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function loadTeam() {
  const snap = await getDocs(collection(db, "users"));
  state.team = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}
function populateSchemeOptions() {
  const schemes = OPTIONS.schemes;
  for (const sel of [$("f-scheme"), $("c-scheme")]) {
    const keepFirst = sel.id === "f-scheme";
    sel.innerHTML = (keepFirst ? '<option value="">All schemes</option>' : "") +
      schemes.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  }
  $("c-frequency").innerHTML = OPTIONS.frequencies.map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join("");
  const ownerOpts = state.team.filter((t) => t.active).map((t) => `<option value="${esc(t.email)}">${esc(t.name || t.email)}</option>`).join("");
  $("c-owner").innerHTML = '<option value="">Unassigned</option>' + ownerOpts;
  $("c-cc").innerHTML = '<option value="">None</option>' + ownerOpts;
}

/* ============================ dashboard ============================ */
function renderDashboard() {
  const withStatus = state.compliances.map((c) => ({ ...c, _status: statusOf(c) }));
  const counts = { OVERDUE: 0, "DUE SOON": 0, UPCOMING: 0, DONE: 0, ONGOING: 0 };
  withStatus.forEach((c) => counts[c._status]++);
  $("k-overdue").textContent = counts.OVERDUE;
  $("k-duesoon").textContent = counts["DUE SOON"];
  $("k-upcoming").textContent = counts.UPCOMING;
  $("k-done").textContent = counts.DONE;
  $("k-ongoing").textContent = counts.ONGOING;

  // nearest outstanding deadline drives the distance meter
  const outstanding = withStatus.filter((c) => c.dueDate && !c.completed).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const nearest = outstanding[0];
  if (nearest) {
    const d = daysBetween(nearest.dueDate);
    const lead = nearest.reminderLeadDays || 15;
    const pct = d < 0 ? 100 : Math.max(0, Math.min(100, 100 - (d / lead) * 66.6));
    $("dm-marker").style.left = pct + "%";
    $("dm-caption").innerHTML = d < 0
      ? `<strong>${esc(nearest.obligation)}</strong> (${esc(nearest.scheme)}) was due ${fmtDay(nearest.dueDate)} — ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue.`
      : `<strong>${esc(nearest.obligation)}</strong> (${esc(nearest.scheme)}) is due ${fmtDay(nearest.dueDate)} — ${d} day${d === 1 ? "" : "s"} away.`;
  } else {
    $("dm-marker").style.left = "0%";
    $("dm-caption").textContent = "Nothing outstanding with a due date.";
  }

  // due this week
  const { start, end } = weekBounds();
  const dueWeek = withStatus
    .filter((c) => c.dueDate && !c.completed && c.dueDate >= start && c.dueDate <= end)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const box = $("due-this-week");
  box.innerHTML = dueWeek.length
    ? dueWeek.map((c) => `
      <div class="wk-item">
        <span class="wk-date">${esc(fmtDay(c.dueDate))}</span>
        <span class="wk-name">${esc(c.obligation)}</span>
        <span class="wk-meta">${esc(c.scheme)}</span>
      </div>`).join("")
    : `<p class="empty-note">Nothing due this week.</p>`;
}
function weekBounds() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now); monday.setDate(now.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { start: iso(monday), end: iso(sunday) };
}

/* ============================ register ============================ */
function currentFilters() {
  return { search: $("f-search").value.trim().toLowerCase(), scheme: $("f-scheme").value, status: $("f-status").value };
}
[$("f-search"), $("f-scheme"), $("f-status")].forEach((el) => el.addEventListener("input", renderRegister));

function renderRegister() {
  const { search, scheme, status } = currentFilters();
  let rows = state.compliances.map((c) => ({ ...c, _status: statusOf(c) }));
  if (scheme) rows = rows.filter((c) => c.scheme === scheme);
  if (status) rows = rows.filter((c) => c._status === status);
  if (search) rows = rows.filter((c) => (c.obligation || "").toLowerCase().includes(search));

  const order = { OVERDUE: 0, "DUE SOON": 1, UPCOMING: 2, ONGOING: 3, DONE: 4 };
  rows.sort((a, b) => (order[a._status] - order[b._status]) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));

  const ownerName = (email) => (state.team.find((t) => t.email === email) || {}).name || email || "—";

  $("register-empty").hidden = rows.length > 0;
  $("register-body").innerHTML = rows.map((c) => {
    const d = c.dueDate ? daysBetween(c.dueDate) : null;
    const daysLabel = c.completed ? "—" : c.dueDate ? (d < 0 ? `${Math.abs(d)}d over` : `${d}d`) : "—";
    return `
    <tr data-id="${esc(c.id)}">
      <td class="col-due">${esc(fmtDay(c.dueDate) || "—")}</td>
      <td class="col-days">${esc(daysLabel)}</td>
      <td><span class="badge badge-${statusClass(c._status)}">${esc(c._status)}</span></td>
      <td>
        <span class="oblig-name">${esc(c.obligation)}</span>
        ${c.period ? `<span class="oblig-period">${esc(c.period)}</span>` : ""}
      </td>
      <td>${esc(c.scheme)}</td>
      <td>${esc(ownerName(c.ownerEmail))}</td>
      <td>${c.link ? `<a class="row-link" href="${esc(c.link)}" target="_blank" rel="noopener">Open ↗</a>` : "—"}</td>
      <td>
        <div class="row-actions">
          ${c.dueDate ? `<input type="checkbox" class="check-done" title="Mark complete" ${c.completed ? "checked" : ""} data-action="toggle">` : ""}
          <button class="btn-icon" data-action="edit" title="Edit">✎</button>
        </div>
      </td>
    </tr>`;
  }).join("");
}

$("register-body").addEventListener("click", async (e) => {
  const row = e.target.closest("tr");
  if (!row) return;
  const id = row.dataset.id;
  const c = state.compliances.find((x) => x.id === id);
  if (e.target.dataset.action === "edit") openDrawer(c);
  if (e.target.dataset.action === "toggle") await toggleComplete(c, e.target.checked);
});

async function toggleComplete(c, completed) {
  const patch = completed
    ? { completed: true, completedOn: todayISO(), filedBy: state.profile.name || state.user.email, updatedAt: serverTimestamp() }
    : { completed: false, completedOn: "", filedBy: "", updatedAt: serverTimestamp() };
  await updateDoc(doc(db, "compliances", c.id), patch);
  Object.assign(c, patch);
  renderDashboard();
  renderRegister();
  toast(completed ? "Marked complete — reminders stop" : "Marked incomplete");
}

/* ============================ drawer: add/edit compliance ============================ */
$("btn-add").addEventListener("click", () => openDrawer(null));

$("btn-import").addEventListener("click", async () => {
  if (!confirm(
    `This loads all 105 obligations from the compliance register into this site.\n\n` +
    `Safe to run more than once — rows are matched by ID, so re-running updates ` +
    `existing rows in place instead of duplicating them. Anything you've already ` +
    `edited (owner, link, completed) on a matching row will be OVERWRITTEN by the ` +
    `original register data.\n\nContinue?`
  )) return;

  const btn = $("btn-import");
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = "Importing…";

  try {
    const res = await fetch("./data/tavasya-seed.json");
    if (!res.ok) throw new Error(`Couldn't load the seed file (${res.status}). Check data/tavasya-seed.json is in the repo.`);
    const rows = await res.json();

    // Firestore batches cap at 500 writes; 105 rows fits in one, but this
    // stays correct if the register grows past that later.
    let batch = writeBatch(db);
    let n = 0;
    for (const row of rows) {
      const { id, ...data } = row;
      batch.set(doc(db, "compliances", id), data, { merge: true });
      n++;
      if (n % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
    }
    await batch.commit();

    await loadCompliances();
    renderDashboard();
    renderRegister();
    toast(`Imported ${rows.length} compliances`);
  } catch (e) {
    alert(e.message || "Import failed. Check the browser console for details.");
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});
$("btn-drawer-close").addEventListener("click", closeDrawer);
$("drawer-backdrop").addEventListener("click", closeDrawer);
$("c-completed").addEventListener("change", (e) => { $("done-fields").hidden = !e.target.checked; });

function openDrawer(c) {
  state.editingId = c ? c.id : null;
  $("drawer-title").textContent = c ? "Edit compliance" : "Add compliance";
  $("btn-delete").hidden = !(c && isAdmin());
  $("drawer-error").hidden = true;

  $("c-id").value = c ? c.id : "";
  $("c-obligation").value = c ? c.obligation : "";
  $("c-scheme").value = c ? c.scheme : OPTIONS.schemes[0];
  $("c-frequency").value = c ? c.frequency || "" : "";
  $("c-period").value = c ? c.period || "" : "";
  $("c-fy").value = c ? c.fy || "" : "";
  $("c-duedate").value = c ? c.dueDate || "" : "";
  $("c-lead").value = c ? c.reminderLeadDays || 15 : 15;
  $("c-regulator").value = c ? c.regulator || "" : "";
  $("c-link").value = c ? c.link || "" : "";
  $("c-owner").value = c ? c.ownerEmail || "" : "";
  $("c-cc").value = c ? c.ccEmail || "" : "";
  $("c-notes").value = c ? c.notes || "" : "";
  $("c-completed").checked = !!(c && c.completed);
  $("done-fields").hidden = !(c && c.completed);
  $("c-completedon").value = c ? c.completedOn || "" : "";
  $("c-filedby").value = c ? c.filedBy || "" : "";
  $("c-ackref").value = c ? c.ackRefNo || "" : "";

  $("drawer-backdrop").hidden = false;
  $("drawer").hidden = false;
  $("drawer").setAttribute("aria-hidden", "false");
  $("c-obligation").focus();
}
function closeDrawer() {
  $("drawer-backdrop").hidden = true;
  $("drawer").hidden = true;
  $("drawer").setAttribute("aria-hidden", "true");
  state.editingId = null;
}

function slugCode(text) {
  return (text || "").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 6) || "OBLIG";
}
function schemeCode(name) {
  const m = { "TAVASYA SSF": "SSF", "TAVASYA Mudrikaran Scheme II": "MS2", "TAVASYA Mudrikaran Scheme III": "MS3" };
  return m[name] || slugCode(name);
}

$("form-compliance").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("drawer-error");
  err.hidden = true;

  const dueDate = $("c-duedate").value;
  const obligation = $("c-obligation").value.trim();
  const scheme = $("c-scheme").value;
  if (!obligation || !scheme) { err.textContent = "Obligation and scheme are required."; err.hidden = false; return; }

  const completed = $("c-completed").checked;
  const payload = {
    obligation, scheme,
    frequency: $("c-frequency").value,
    period: $("c-period").value.trim(),
    fy: $("c-fy").value.trim(),
    dueDate,
    reminderLeadDays: Number($("c-lead").value) || 15,
    regulator: $("c-regulator").value.trim(),
    link: $("c-link").value.trim(),
    ownerEmail: $("c-owner").value,
    ccEmail: $("c-cc").value,
    notes: $("c-notes").value.trim(),
    completed,
    completedOn: completed ? ($("c-completedon").value || todayISO()) : "",
    filedBy: completed ? ($("c-filedby").value.trim() || state.profile.name || state.user.email) : "",
    ackRefNo: completed ? $("c-ackref").value.trim() : "",
    updatedAt: serverTimestamp()
  };

  const existingId = $("c-id").value;
  const id = existingId || `${schemeCode(scheme)}-${slugCode(obligation)}-${dueDate ? dueDate.replace(/-/g, "") : "ONG"}`;

  try {
    await setDoc(doc(db, "compliances", id), {
      ...payload,
      ...(existingId ? {} : { createdAt: serverTimestamp(), createdBy: state.user.email })
    }, { merge: true });
    toast(existingId ? "Compliance updated" : "Compliance added");
    closeDrawer();
    await loadCompliances();
    renderDashboard();
    renderRegister();
  } catch (e2) {
    err.textContent = e2.message || "Couldn't save that.";
    err.hidden = false;
  }
});

$("btn-delete").addEventListener("click", async () => {
  const id = $("c-id").value;
  if (!id) return;
  if (!confirm("Delete this compliance permanently?")) return;
  await deleteDoc(doc(db, "compliances", id));
  toast("Deleted");
  closeDrawer();
  await loadCompliances();
  renderDashboard();
  renderRegister();
});

/* ============================ team ============================ */
function renderTeam() {
  $("team-body").innerHTML = state.team.map((t) => `
    <tr data-email="${esc(t.email)}">
      <td>${esc(t.name || "—")}</td>
      <td>${esc(t.email)}</td>
      <td>${isAdmin() ? `
        <select class="t-role" data-email="${esc(t.email)}">
          <option value="member" ${t.role === "member" ? "selected" : ""}>Member</option>
          <option value="admin" ${t.role === "admin" ? "selected" : ""}>Admin</option>
        </select>` : esc(t.role === "admin" ? "Admin" : "Member")}</td>
      <td>${t.active ? "Active" : "Removed"}</td>
      <td>${isAdmin() ? `<button class="btn-icon t-toggle" data-email="${esc(t.email)}">${t.active ? "Remove" : "Restore"}</button>` : ""}</td>
    </tr>`).join("");
}

$("team-body").addEventListener("change", async (e) => {
  if (!e.target.classList.contains("t-role")) return;
  const email = e.target.dataset.email;
  await updateDoc(doc(db, "users", email), { role: e.target.value });
  await loadTeam(); renderTeam(); populateSchemeOptions();
  toast("Role updated");
});
$("team-body").addEventListener("click", async (e) => {
  if (!e.target.classList.contains("t-toggle")) return;
  const email = e.target.dataset.email;
  const person = state.team.find((t) => t.email === email);
  await updateDoc(doc(db, "users", email), { active: !person.active });
  await loadTeam(); renderTeam(); populateSchemeOptions();
  toast(person.active ? "Access removed" : "Access restored");
});

$("btn-add-person").addEventListener("click", async () => {
  const name = prompt("Full name:");
  if (!name) return;
  const email = (prompt(`Work email (must end @${ORG_DOMAIN}):`) || "").trim().toLowerCase();
  if (!email.endsWith("@" + ORG_DOMAIN)) { alert(`Must be an @${ORG_DOMAIN} address.`); return; }
  const role = confirm("Make this person an Admin? Cancel = Member.") ? "admin" : "member";
  await setDoc(doc(db, "users", email), { email, name, role, active: true });
  await loadTeam(); renderTeam(); populateSchemeOptions();
  toast("Person added");
});

/* ============================ toast ============================ */
let toastTimer;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}
