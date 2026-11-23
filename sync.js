// Green Jackets Pick'em: copies the live ESPN PGA leaderboard into Firestore.
// Odds, field and tee times still come from your Wednesday paste in the Admin tab.
// Needs one secret: FIREBASE_SERVICE_ACCOUNT. ESPN's feed needs no key.
// Optional env for manual runs:
//   PREVIEW=1  print what ESPN returns (no Firebase needed, nothing written)
//   DRY=1      read Firestore and show what would be written, but write nothing
import admin from "firebase-admin"; // Firebase Admin SDK: logs in with the service account and reads/writes Firestore
const { FIREBASE_SERVICE_ACCOUNT, DRY, PREVIEW } = process.env;
const SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
// The scoreboard has no cut line; ESPN's leaderboard feed (what espn.com uses) does.
const LEADERBOARD =
  "https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga&event=";
const DAY = 864e5;
/* ---------- helpers ---------- */
const norm = (n) =>
  String(n || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim(); // "Sami Välimäki" -> "sami valimaki", "J.J. Spaun" -> "jj spaun"
const toPar = (s) => {
  if (s == null) return null;
  s = String(s).trim().toUpperCase();
  return s === "E" ? 0 : /^[+-]?\d+$/.test(s) ? parseInt(s, 10) : null;
};
const fmtScore = (n) =>
  n == null ? "" : n === 0 ? "E" : n > 0 ? `+${n}` : String(n);
const words = (s) =>
  new Set(
    norm(s)
      .split(" ")
      .filter((w) => w.length > 2),
  );
const overlap = (a, b) => [...words(a)].filter((w) => words(b).has(w)).length;
/* ---------- turn one ESPN event into positions, scores, holes played ---------- */
function analyse(event) {
  const comps = event.competitions?.[0]?.competitors || [];
  const rows = comps.map((c) => {
    const rounds = (c.linescores || []).map((l) => ({
      period: l.period,
      holes: (l.linescores || []).length,
      firstHole: l.linescores?.[0]?.period, // hole number they teed off on this round
    }));
    const last = rounds.filter((r) => r.holes > 0).at(-1); // most recent round with hole scores
    // ESPN's API has no "thru" text, so build it: holes played, plus "*" (like ESPN's site) when
    // the round started anywhere but hole 1, e.g. teeing off on 10 and through 4 holes -> "4*".
    const thru = !last
      ? ""
      : last.holes >= 18
        ? "F"
        : `${last.holes}${last.firstHole > 1 ? "*" : ""}`;
    return {
      c,
      rounds,
      last,
      name: c.athlete?.fullName || c.athlete?.displayName || "",
      par: toPar(c.score),
      thru,
    };
  });
  const maxRound = Math.max(0, ...rows.map((r) => r.last?.period || 0));
  const cutDone = maxRound >= 3;
  for (const r of rows) {
    const status = JSON.stringify(r.c.status || {}).toUpperCase();
    r.out = /CUT|WITHDRAW|WD|DISQ/.test(status)
      ? "status says out"
      : cutDone && !r.rounds.some((x) => x.period >= 3)
        ? "no round 3 (missed cut?)"
        : r.last && r.last.holes < 18 && r.last.period < maxRound
          ? "stopped mid-round (withdrew?)"
          : "";
  }
  // Ties share the best position: T3 counts as 3 (1 + number of golfers strictly ahead).
  const ranked = rows.filter((r) => !r.out && r.par != null && r.last);
  for (const r of ranked)
    r.pos = 1 + ranked.filter((o) => o.par < r.par).length;
  return { rows, maxRound, started: rows.some((r) => r.last) };
}
/* ---------- cut line (projected during the cut round, final after) ---------- */
// Returns { score, round, count } or null (no-cut event, not published yet, or ESPN hiccup).
// Never throws: a failure here must not stop scores from syncing.
async function getCut(eventId) {
  try {
    const r = await fetch(LEADERBOARD + eventId, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const t = (await r.json()).events?.[0]?.tournament || {};
    if (!(t.cutRound > 0) || typeof t.cutScore !== "number") return null;
    return { score: t.cutScore, round: t.cutRound, count: t.cutCount ?? null };
  } catch (e) {
    console.warn(`Couldn't read cut line for event ${eventId}: ${e.message}`);
    return null;
  }
}
/* ---------- is the event finished? ---------- */
// ESPN's own status, e.g. "Round 4 - In Progress", "Round 4 - Suspended", "Final".
// Its endDate isn't updated for weather delays, so this is what decides when we stop syncing.
function statusOf(event) {
  const st = event?.status?.type || {};
  return {
    detail: event?.competitions?.[0]?.status?.type?.detail || st.detail || st.description || "",
    done: st.completed === true || st.state === "post",
  };
}
// Same, but by ESPN id from the leaderboard feed (for when the scoreboard has moved on). Never throws.
async function getStatus(eventId) {
  try {
    const r = await fetch(LEADERBOARD + eventId, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const ev = (await r.json()).events?.[0];
    return ev ? statusOf(ev) : null;
  } catch (e) {
    console.warn(`Couldn't read status for event ${eventId}: ${e.message}`);
    return null;
  }
}
const fmtCut = (c) =>
  c ? `cut ${fmtScore(c.score)} (round ${c.round}, ${c.count ?? "?"} players${c.final ? ", final" : ""})` : "no cut line";
/* ---------- preview mode: just show ESPN's data ---------- */
async function preview(events) {
  for (const e of events) {
    const A = analyse(e);
    const cut = await getCut(e.id);
    if (cut) cut.final = A.maxRound > cut.round;
    console.log(
      `\n${e.name} (id ${e.id}) starts ${e.date}: ${A.rows.length} golfers, latest round ${A.maxRound}, started: ${A.started}, ${fmtCut(cut)}, status "${statusOf(e).detail}"${statusOf(e).done ? " (complete)" : ""}`,
    );
    A.rows
      .filter((r) => r.pos)
      .sort((a, b) => a.pos - b.pos)
      .slice(0, 10)
      .forEach((r) =>
        console.log(
          `  ${String(r.pos).padStart(3)}  ${r.name.padEnd(28)} ${fmtScore(r.par).padStart(4)}  thru ${r.thru || "-"}`,
        ),
      );
    const out = A.rows.filter((r) => r.out);
    console.log(`  flagged out (score 0): ${out.length}`);
    out.slice(0, 15).forEach((r) => console.log(`    ${r.name}: ${r.out}`));
  }
}
/* ---------- main ---------- */
const res = await fetch(SCOREBOARD, {
  headers: { "User-Agent": "Mozilla/5.0" },
});
if (!res.ok) throw new Error(`ESPN scoreboard returned HTTP ${res.status}`);
const sb = await res.json();
const events = sb.events || [];
const season = sb.leagues?.[0]?.season?.year ?? sb.season?.year;
const calendar = (sb.leagues?.[0]?.calendar || []).map((c) => ({
  id: c.id,
  name: c.label,
  start: c.startDate,
  end: c.endDate,
}));
if (PREVIEW) {
  console.log(`Season ${season} calendar: ${calendar.length} events`);
  await preview(events);
  process.exit(0);
}
if (!FIREBASE_SERVICE_ACCOUNT)
  throw new Error("Missing FIREBASE_SERVICE_ACCOUNT");
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)),
});
const db = admin.firestore();
// Save the season calendar so the app's Schedule tab can list every event (only writes when it changes).
if (season && calendar.length) {
  const ref = db.doc(`schedule/${season}`),
    cur = await ref.get();
  if (
    !cur.exists ||
    (cur.data().source !== "manual" &&
      JSON.stringify(cur.data().events) !== JSON.stringify(calendar))
  ) {
    // a schedule imported by hand is never overwritten
    if (DRY)
      console.log(
        `[dry run] would save ${calendar.length} events for ${season}`,
      );
    else {
      await ref.set({ season, events: calendar, updatedAt: Date.now() });
      console.log(`Saved ${calendar.length} schedule events for ${season}`);
    }
  }
}
if (!events.length) {
  console.log("ESPN lists no events right now.");
  process.exit(0);
}
const now = Date.now();
const snap = await db.collection("tournaments").get();
// Only tournaments you've set up, from the moment the first group tees off (their earliest tee time)
// until ESPN says the event is complete (saved as final: true). This is what makes the 5-minute schedule
// "dynamic": the workflow wakes up early on Thursday, and this check ends the run right away until the
// first tee time has passed. Weather delays that push play into Monday keep syncing until ESPN calls it
// done; MAX_DAYS is only a safety net so a tournament ESPN never marks complete doesn't sync forever.
const MAX_DAYS = 7;
const active = snap.docs.filter((d) => {
  const t = d.data();
  const start = Date.parse(`${t.date}T00:00:00Z`);
  const first = Math.min(
    ...Object.values(t.tee || {}).filter(Number.isFinite),
  ); // Infinity if no tee times saved
  if (!t.final && t.status && now > start + MAX_DAYS * DAY && now <= start + (MAX_DAYS + 1) * DAY)
    console.warn(`${t.name} (${t.date}): ESPN still hasn't marked it complete after ${MAX_DAYS} days. No longer syncing; use the Admin paste box if needed.`);
  return (
    !t.final &&
    now >= start &&
    now <= start + MAX_DAYS * DAY &&
    (!Number.isFinite(first) || now >= first)
  );
});
if (!active.length) {
  console.log(
    "No tournament live yet (before the first tee time) or none this week. Nothing to do.",
  );
  process.exit(0);
}
for (const d of active) {
  const t = d.data(),
    label = `${t.name} (${t.date})`;
  try {
    if ((t.entries || []).some((e) => e.name.includes("/"))) {
      console.log(`${label}: team event, use the Admin paste box.`);
      continue;
    }
    const near = events.filter(
      (e) =>
        Math.abs(Date.parse(e.date.slice(0, 10)) - Date.parse(t.date)) <= DAY,
    );
    const ev = near.sort(
      (a, b) => overlap(t.name, b.name) - overlap(t.name, a.name),
    )[0];
    if (!ev || (near.length > 1 && !overlap(t.name, ev.name))) {
      // ESPN may move its scoreboard on to next week's event right after this one ends.
      // If we saved ESPN's id on an earlier run, ask the leaderboard feed whether it's complete.
      const st = t.espnId ? await getStatus(t.espnId) : null;
      if (st?.done) {
        if (DRY) console.log(`[dry run] ${label}: off ESPN's scoreboard, ESPN says "${st.detail}". Would mark final.`);
        else {
          await d.ref.update({ final: true, finalAt: Date.now(), status: st.detail });
          console.log(`${label}: off ESPN's scoreboard, ESPN says "${st.detail}". Marked final.`);
        }
      } else console.log(`${label}: no matching ESPN event, skipping.`);
      continue;
    }
    const st = statusOf(ev);
    const A = analyse(ev);
    if (!A.started) {
      console.log(`${label}: ESPN has no scores yet.`);
      continue;
    }
    // Match ESPN names to your entries: full name first, then last name + first initial.
    const byName = new Map(t.entries.map((e) => [norm(e.name), e.key]));
    const li = (n) => {
      const p = norm(n).split(" ");
      return `${p.at(-1)}|${(p[0] || "")[0]}`;
    };
    const byLI = new Map(),
      dup = new Set();
    for (const e of t.entries) {
      const k = li(e.name);
      byLI.has(k) ? dup.add(k) : byLI.set(k, e.key);
    }
    const results = {},
      live = {};
    let unmatched = 0;
    for (const r of A.rows) {
      const li2 = li(r.name);
      const key =
        byName.get(norm(r.name)) ?? (dup.has(li2) ? undefined : byLI.get(li2));
      if (!key) {
        unmatched++;
        continue;
      }
      if (r.out) results[key] = 0;
      else if (r.pos) results[key] = r.pos;
      if (r.par != null || r.thru)
        live[key] = { s: fmtScore(r.par), t: r.thru };
    }
    const cut = await getCut(ev.id);
    if (cut) cut.final = A.maxRound > cut.round; // round 3 started: the cut is made
    const msg = `${label}: matched ${Object.keys(live).length} of ${t.entries.length} entries to ESPN "${ev.name}" (${unmatched} ESPN golfers not in your field), ${A.rows.filter((r) => r.out).length} flagged out, ${fmtCut(cut)}, "${st.detail}"${st.done ? " -> marking final" : ""}`;
    const update = { results, live, resultsAt: Date.now(), cut, espnId: ev.id, status: st.detail };
    if (st.done) Object.assign(update, { final: true, finalAt: Date.now() });
    if (DRY) console.log(`[dry run] ${msg}`);
    else {
      await d.ref.update(update);
      console.log(msg);
    }
  } catch (e) {
    console.error(`${label}: ${e.message}`);
    process.exitCode = 1;
  }
}
