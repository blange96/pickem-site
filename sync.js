// Green Jackets Pick'em: copies the live ESPN PGA leaderboard into Firestore.
// Odds, field and tee times still come from your Wednesday paste in the Admin tab.
// Needs one secret: FIREBASE_SERVICE_ACCOUNT. ESPN's feed needs no key.
// Optional env for manual runs:
//   PREVIEW=1  print what ESPN returns (no Firebase needed, nothing written)
//   DRY=1      read Firestore and show what would be written, but write nothing
import admin from "firebase-admin";
const { FIREBASE_SERVICE_ACCOUNT, DRY, PREVIEW } = process.env;
const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
const DAY = 864e5;
/* ---------- helpers ---------- */
const norm = n => String(n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
 .replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();   // "Sami Välimäki" -> "sami valimaki", "J.J. Spaun" -> "jj spaun"
const toPar = s => {
 if (s == null) return null;
 s = String(s).trim().toUpperCase();
 return s === "E" ? 0 : /^[+-]?\d+$/.test(s) ? parseInt(s, 10) : null;
};
const fmtScore = n => n == null ? "" : n === 0 ? "E" : n > 0 ? `+${n}` : String(n);
const words = s => new Set(norm(s).split(" ").filter(w => w.length > 2));
const overlap = (a, b) => [...words(a)].filter(w => words(b).has(w)).length;
/* ---------- turn one ESPN event into positions, scores, holes played ---------- */
function analyse(event) {
 const comps = event.competitions?.[0]?.competitors || [];
 const rows = comps.map(c => {
   const rounds = (c.linescores || []).map(l => ({ period: l.period, holes: (l.linescores || []).length }));
   const last = rounds.filter(r => r.holes > 0).at(-1);   // most recent round with hole scores
   return { c, rounds, last, name: c.athlete?.fullName || c.athlete?.displayName || "", par: toPar(c.score),
     thru: last ? (last.holes >= 18 ? "F" : String(last.holes)) : "" };
 });
 const maxRound = Math.max(0, ...rows.map(r => r.last?.period || 0));
 const cutDone = maxRound >= 3;
 for (const r of rows) {
   const status = JSON.stringify(r.c.status || {}).toUpperCase();
   r.out = /CUT|WITHDRAW|WD|DISQ/.test(status) ? "status says out"
     : cutDone && !r.rounds.some(x => x.period >= 3) ? "no round 3 (missed cut?)"
     : r.last && r.last.holes < 18 && r.last.period < maxRound ? "stopped mid-round (withdrew?)" : "";
 }
 // Ties share the best position: T3 counts as 3 (1 + number of golfers strictly ahead).
 const ranked = rows.filter(r => !r.out && r.par != null && r.last);
 for (const r of ranked) r.pos = 1 + ranked.filter(o => o.par < r.par).length;
 return { rows, maxRound, started: rows.some(r => r.last) };
}
/* ---------- preview mode: just show ESPN's data ---------- */
function preview(events) {
 for (const e of events) {
   const A = analyse(e);
   console.log(`\n${e.name} (id ${e.id}) starts ${e.date}: ${A.rows.length} golfers, latest round ${A.maxRound}, started: ${A.started}`);
   A.rows.filter(r => r.pos).sort((a, b) => a.pos - b.pos).slice(0, 10)
     .forEach(r => console.log(`  ${String(r.pos).padStart(3)}  ${r.name.padEnd(28)} ${fmtScore(r.par).padStart(4)}  thru ${r.thru || "-"}`));
   const out = A.rows.filter(r => r.out);
   console.log(`  flagged out (score 0): ${out.length}`);
   out.slice(0, 15).forEach(r => console.log(`    ${r.name}: ${r.out}`));
 }
}
/* ---------- main ---------- */
const res = await fetch(SCOREBOARD, { headers: { "User-Agent": "Mozilla/5.0" } });
if (!res.ok) throw new Error(`ESPN scoreboard returned HTTP ${res.status}`);
const events = (await res.json()).events || [];
if (!events.length) { console.log("ESPN lists no events right now."); process.exit(0); }
if (PREVIEW) { preview(events); process.exit(0); }
if (!FIREBASE_SERVICE_ACCOUNT) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const now = Date.now();
const snap = await db.collection("tournaments").get();
// Only tournaments you've set up in Admin, from Thursday 00:00 UTC through Monday midday UTC.
const active = snap.docs.filter(d => {
 const start = Date.parse(`${d.data().date}T00:00:00Z`);
 return now >= start && now <= start + 4.5 * DAY;
});
if (!active.length) { console.log("No tournament in the live window. Nothing to do."); process.exit(0); }
for (const d of active) {
 const t = d.data(), label = `${t.name} (${t.date})`;
 try {
   if ((t.entries || []).some(e => e.name.includes("/"))) { console.log(`${label}: team event, use the Admin paste box.`); continue; }
   const near = events.filter(e => Math.abs(Date.parse(e.date.slice(0, 10)) - Date.parse(t.date)) <= DAY);
   const ev = near.sort((a, b) => overlap(t.name, b.name) - overlap(t.name, a.name))[0];
   if (!ev || (near.length > 1 && !overlap(t.name, ev.name))) { console.log(`${label}: no matching ESPN event, skipping.`); continue; }
   const A = analyse(ev);
   if (!A.started) { console.log(`${label}: ESPN has no scores yet.`); continue; }
   // Match ESPN names to your entries: full name first, then last name + first initial.
   const byName = new Map(t.entries.map(e => [norm(e.name), e.key]));
   const li = n => { const p = norm(n).split(" "); return `${p.at(-1)}|${(p[0] || "")[0]}`; };
   const byLI = new Map(), dup = new Set();
   for (const e of t.entries) { const k = li(e.name); byLI.has(k) ? dup.add(k) : byLI.set(k, e.key); }
   const results = {}, live = {}; let unmatched = 0;
   for (const r of A.rows) {
     const li2 = li(r.name);
     const key = byName.get(norm(r.name)) ?? (dup.has(li2) ? undefined : byLI.get(li2));
     if (!key) { unmatched++; continue; }
     if (r.out) results[key] = 0; else if (r.pos) results[key] = r.pos;
     if (r.par != null || r.thru) live[key] = { s: fmtScore(r.par), t: r.thru };
   }
   const msg = `${label}: matched ${Object.keys(live).length} of ${t.entries.length} entries to ESPN "${ev.name}" (${unmatched} ESPN golfers not in your field), ${A.rows.filter(r => r.out).length} flagged out`;
   if (DRY) console.log(`[dry run] ${msg}`);
   else { await d.ref.update({ results, live, resultsAt: Date.now() }); console.log(msg); }
 } catch (e) { console.error(`${label}: ${e.message}`); process.exitCode = 1; }
}
