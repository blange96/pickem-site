// Green Jackets Pick'em: emails every signed-up user.
//   notifyOdds    - when pga-setup.js posts or changes the week's odds
//   notifyResults - when sync.js sees ESPN mark the tournament complete (winner, standings, best pick, next event)
// Env: SMTP_HOST, SMTP_PORT (default 465), SMTP_USER, SMTP_PASS, MAIL_FROM (default SMTP_USER),
//      SITE_URL (optional, linked in the email)
// State: notifications/{tournamentId} remembers which emails already went out:
//        postedAt (first "odds are up" email), resultsSentAt (the results email, sent once).
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, SITE_URL } =
  process.env;

const fmtOdds = (o) => (o == null ? "—" : o > 0 ? `+${o}` : String(o));
const escHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

/* What changed between the saved entries and the new ones (order-independent). */
export function diffEntries(oldEntries, newEntries) {
  const before = new Map((oldEntries || []).map((e) => [e.key, e]));
  const after = new Map(newEntries.map((e) => [e.key, e]));
  const moved = [],
    added = [],
    removed = [],
    teeMoved = [];
  for (const [k, e] of after) {
    const o = before.get(k);
    if (!o) added.push(e);
    else {
      if (o.odds !== e.odds)
        moved.push({ name: e.name, from: o.odds, to: e.odds });
      if (o.tee !== e.tee) teeMoved.push(e);
    }
  }
  for (const [k, o] of before) if (!after.has(k)) removed.push(o);
  return {
    moved,
    added,
    removed,
    teeMoved,
    any: moved.length + added.length + removed.length + teeMoved.length > 0,
  };
}

/* Subject + plain text + HTML for one recipient. */
export function compose({ first, doc, diff, firstTee, name }) {
  const t = doc.name,
    when = new Date(firstTee).toLocaleString("en-US", {
      timeZone: doc.tz,
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  const subject = first
    ? `⛳ Odds are up for ${t}. Make your pick!`
    : `⛳ Odds updated for ${t}`;
  const lines = [];
  if (first) {
    const fav = [...doc.entries].sort((a, b) => a.odds - b.odds).slice(0, 5);
    lines.push(
      `The field and odds for ${t} are posted: ${doc.entries.length} golfers to choose from.`,
      "",
      "Top of the board:",
      ...fav.map((e) => `  ${e.name} ${fmtOdds(e.odds)}`),
    );
  } else {
    lines.push(`The odds for ${t} have been updated since they were posted.`);
    const cap = 15,
      more = (n) => (n > cap ? [`  ...and ${n - cap} more`] : []);
    if (diff.moved.length)
      lines.push(
        "",
        `Odds moved (${diff.moved.length}):`,
        ...diff.moved
          .slice(0, cap)
          .map((m) => `  ${m.name}: ${fmtOdds(m.from)} → ${fmtOdds(m.to)}`),
        ...more(diff.moved.length),
      );
    if (diff.added.length)
      lines.push(
        "",
        `Added to the field (${diff.added.length}):`,
        ...diff.added
          .slice(0, cap)
          .map((e) => `  ${e.name} ${fmtOdds(e.odds)}`),
        ...more(diff.added.length),
      );
    if (diff.removed.length)
      lines.push(
        "",
        `No longer in the field (${diff.removed.length}):`,
        ...diff.removed.slice(0, cap).map((e) => `  ${e.name}`),
        ...more(diff.removed.length),
      );
    if (diff.teeMoved.length)
      lines.push("", `Tee times changed for ${diff.teeMoved.length} golfer(s).`);
  }
  lines.push(
    "",
    `First group tees off ${when}. Picks lock when your golfer tees off.`,
  );
  const body = [`Hi ${name},`, "", ...lines].join("\n");
  const text = SITE_URL ? `${body}\n\n${SITE_URL}` : body;
  const link = SITE_URL
    ? `<p><a href="${escHtml(SITE_URL)}">Open Green Jackets Pick'em</a></p>`
    : "";
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5"><pre style="font:inherit;white-space:pre-wrap;margin:0">${escHtml(body)}</pre>${link}</div>`;
  return { subject, text, html };
}

/* Every Firebase Auth user with an email, named the way the app names them. */
async function recipients(admin) {
  const names = new Map(
    (await admin.firestore().collection("users").get()).docs.map((d) => [
      d.id,
      d.data().name,
    ]),
  );
  const out = [];
  let token;
  do {
    const page = await admin.auth().listUsers(1000, token);
    for (const u of page.users)
      if (u.email && !u.disabled)
        out.push({
          email: u.email,
          name: names.get(u.uid) || u.displayName || u.email.split("@")[0],
        });
    token = page.pageToken;
  } while (token);
  return out;
}

/* Email everyone in `to`, building each message with make(recipient). Returns how many went out.
   Never throws for email problems; flags the workflow run if any failed. */
async function sendAll(to, make) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log("SMTP_HOST/SMTP_USER/SMTP_PASS not set, skipping email.");
    return 0;
  }
  const nodemailer = (await import("nodemailer")).default;
  const port = Number(SMTP_PORT || 465);
  const tx = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  let sent = 0;
  for (const r of to) {
    try {
      await tx.sendMail({ from: MAIL_FROM || SMTP_USER, to: r.email, ...make(r) });
      sent++;
    } catch (e) {
      console.log(`  failed to email user "${r.name}": ${e.message}`);
    }
  }
  console.log(`Emailed ${sent}/${to.length}.`);
  if (sent < to.length) process.exitCode = 1; // flag the workflow run so failures get noticed
  return sent;
}

/* Send the posted/updated email if anything changed. Never throws for email problems. */
export async function notifyOdds({ admin, id, doc, diff, firstTee, dry }) {
  const db = admin.firestore(),
    stateRef = db.doc(`notifications/${id}`),
    state = await stateRef.get();
  const first = !state.data()?.postedAt;
  const to = await recipients(admin);
  console.log(
    `Email: "${first ? "odds posted" : "odds updated"}" to ${to.length} user(s).`,
  );
  if (!to.length) return;
  if (dry) {
    const m = compose({ first, doc, diff, firstTee, name: to[0].name });
    console.log(`[dry run] no email sent. Sample:\nSubject: ${m.subject}\n${m.text}`);
    return;
  }
  const sent = await sendAll(to, (r) =>
    compose({ first, doc, diff, firstTee, name: r.name }),
  );
  if (sent) {
    const now = Date.now();
    await stateRef.set(
      {
        ...(first ? { postedAt: now } : {}),
        lastSentAt: now,
        sends: (state.data()?.sends || 0) + 1,
      },
      { merge: true },
    );
  }
}

/* ====================== weekly results email ====================== */
const DAY = 864e5;
const MULT = { regular: 1, signature: 1.25, major: 2 }; // must match index.html
// Points exactly as the app scores them: odds / position / 100 x event multiplier; out (0) scores 0.
const ptsOf = (t, key) => {
  const e = (t.entries || []).find((x) => x.key === key),
    r = t.results?.[key];
  if (!e || r == null) return null;
  return r > 0 && e.odds ? (e.odds / r / 100) * (MULT[t.type] || 1) : 0;
};
const fmtPts = (x) => (x ?? 0).toFixed(2);
const ord = (n) => {
  const s = ["th", "st", "nd", "rd"],
    v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const tied = (t, r) =>
  Object.values(t.results || {}).filter((x) => x === r).length > 1;
const posShort = (t, r) =>
  r == null ? "—" : r === 0 ? "CUT/WD" : `${tied(t, r) ? "T" : ""}${r}`;
const posPhrase = (t, r) =>
  r == null
    ? "had no result"
    : r === 0
      ? "missed the cut or withdrew"
      : tied(t, r)
        ? `finished T${r}`
        : r === 1
          ? "won the tournament"
          : `finished ${ord(r)}`;
const andList = (a) =>
  a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`;

/* Season standings like the app's: every league member, total points from every pick.
   skipTid leaves one tournament out (the "before this week" table). Tied totals share a rank. */
function standings(users, tours, picks, skipTid) {
  const byId = new Map(tours.map((t) => [t.id, t]));
  const rows = users.map((u) => ({ uid: u.uid, name: u.name || "Player", tot: 0 }));
  const byUid = new Map(rows.map((r) => [r.uid, r]));
  for (const p of picks) {
    if (p.tid === skipTid) continue;
    const t = byId.get(p.tid),
      r = byUid.get(p.uid);
    if (t && r) r.tot += ptsOf(t, p.key) || 0;
  }
  const c = (x) => Math.round(x * 100); // compare in cents so float noise never splits a tie
  for (const r of rows) {
    r.rank = 1 + rows.filter((o) => c(o.tot) > c(r.tot)).length;
    r.tie = rows.filter((o) => c(o.tot) === c(r.tot)).length > 1;
  }
  return rows.sort((a, b) => b.tot - a.tot || a.name.localeCompare(b.name));
}

/* Everything the email says, from plain data (no Firebase), so it can be tested offline. */
export function buildResults({ id, tours, picks, users, next }) {
  const t = tours.find((x) => x.id === id);
  if (!t) throw new Error(`No tournament ${id}`);
  const nameOf = new Map(users.map((u) => [u.uid, u.name || "Player"]));
  const week = picks
    .filter((p) => p.tid === id)
    .map((p) => ({
      uid: p.uid,
      who: nameOf.get(p.uid) || p.who || "Player",
      key: p.key,
      golfer: p.name,
      odds: (t.entries || []).find((e) => e.key === p.key)?.odds,
      pos: t.results?.[p.key],
      pts: ptsOf(t, p.key) || 0,
    }));
  const top = Math.max(0, ...week.map((w) => w.pts));
  const winners = top > 0 ? week.filter((w) => w.pts === top) : [];

  const before = standings(users, tours, picks, id),
    after = standings(users, tours, picks, null);
  const prev = new Map(before.map((r) => [r.uid, r]));
  const table = after.map((r) => ({
    ...r,
    prev: prev.get(r.uid)?.rank ?? r.rank,
    week: week.find((w) => w.uid === r.uid)?.pts || 0,
  }));

  const field = (t.entries || []).map((e) => ({
    key: e.key,
    golfer: e.name,
    odds: e.odds,
    pos: t.results?.[e.key],
    pts: ptsOf(t, e.key) || 0,
    by: week.filter((w) => w.key === e.key).map((w) => w.who),
  }));
  const bestPts = Math.max(0, ...field.map((f) => f.pts));
  const best = bestPts > 0 ? field.filter((f) => f.pts === bestPts) : [];

  return {
    t,
    winners,
    table,
    hadPoints: before.some((r) => r.tot > 0),
    leadersBefore: before.filter((r) => r.rank === 1 && r.tot > 0),
    best,
    next,
  };
}

/* The standings paragraph: who leads, and who moved. */
function standingsStory(d) {
  const out = [];
  const leaders = d.table.filter((r) => r.rank === 1);
  if (!leaders.length || !(leaders[0].tot > 0))
    return ["Nobody is on the board yet."];
  const lead = leaders[0];
  const second = d.table.find((r) => r.rank > 1);
  const gap = second ? ` ${second.name} is ${fmtPts(lead.tot - second.tot)} back in ${ord(second.rank)}.` : "";
  const wasLeader = new Set(d.leadersBefore.map((r) => r.uid));
  if (leaders.length > 1)
    out.push(`${andList(leaders.map((r) => r.name))} are tied for first with ${fmtPts(lead.tot)} points.`);
  else if (!d.hadPoints)
    out.push(`${lead.name} leads the season after the first event with ${fmtPts(lead.tot)} points.${gap}`);
  else if (wasLeader.has(lead.uid) && wasLeader.size === 1)
    out.push(`${lead.name} stays on top with ${fmtPts(lead.tot)} points.${gap}`);
  else
    out.push(
      `${lead.name} takes over first place with ${fmtPts(lead.tot)} points${d.leadersBefore.length ? `, passing ${andList(d.leadersBefore.filter((r) => r.uid !== lead.uid).map((r) => r.name))}` : ""}.${gap}`,
    );
  if (d.hadPoints) {
    const moved = d.table
      .filter((r) => r.prev !== r.rank)
      .sort((a, b) => b.prev - b.rank - (a.prev - a.rank));
    if (!moved.length) out.push("Nobody changed places this week.");
    else
      for (const r of moved) {
        const n = Math.abs(r.prev - r.rank),
          spot = `${n} spot${n > 1 ? "s" : ""}`;
        out.push(
          r.rank < r.prev
            ? `  ▲ ${r.name} climbs ${spot} to ${ord(r.rank)} (+${fmtPts(r.week)} this week)`
            : `  ▼ ${r.name} slips ${spot} to ${ord(r.rank)}`,
        );
      }
  }
  return out;
}

const rankText = (r) => `${r.tie ? "T" : ""}${r.rank}`;
const moveText = (r) =>
  r.prev === r.rank ? "—" : r.rank < r.prev ? `▲${r.prev - r.rank}` : `▼${r.rank - r.prev}`;
const whenText = (start) =>
  new Date(`${String(start).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  });

/* Subject + plain text + HTML for one recipient. */
export function composeResults(d, name) {
  const t = d.t,
    w = d.winners;
  const subject = w.length
    ? `🏆 ${t.name} results: ${andList(w.map((x) => x.who))} ${w.length > 1 ? "tie" : "wins"} the week`
    : `🏆 ${t.name} results`;

  // 1. winner
  const winLines = !w.length
    ? ["Nobody's golfer scored points this week."]
    : w.length === 1
      ? [`${w[0].who} wins the week with ${w[0].golfer} (${fmtOdds(w[0].odds)}), who ${posPhrase(t, w[0].pos)}, for ${fmtPts(w[0].pts)} points.`]
      : [
          `${andList(w.map((x) => x.who))} tie for the week with ${fmtPts(w[0].pts)} points each:`,
          ...w.map((x) => `  ${x.who}: ${x.golfer} (${fmtOdds(x.odds)}), ${posPhrase(t, x.pos)}`),
        ];
  // 2. standings
  const story = standingsStory(d);
  const nameW = Math.max(6, ...d.table.map((r) => r.name.length));
  const tableText = [
    `  ${"#".padEnd(4)}${"Player".padEnd(nameW + 2)}${"Points".padStart(8)}${"Week".padStart(8)}  Move`,
    ...d.table.map(
      (r) =>
        `  ${rankText(r).padEnd(4)}${r.name.padEnd(nameW + 2)}${fmtPts(r.tot).padStart(8)}${(r.week ? `+${fmtPts(r.week)}` : "—").padStart(8)}  ${moveText(r)}`,
    ),
  ];
  // 3. best pick
  const bestLines = !d.best.length
    ? ["No golfer in the field scored points this week."]
    : d.best.map(
        (b) =>
          `${b.golfer} (${fmtOdds(b.odds)}) ${posPhrase(t, b.pos)} for ${fmtPts(b.pts)} points. ${b.by.length ? `Picked by ${andList(b.by)}.` : "Nobody picked him."}`,
      );
  // 4. next week
  const nx = d.next;
  const nextLines = nx
    ? [
        `${nx.name}${nx.location ? ` at ${nx.location}` : ""}, starting ${whenText(nx.start)}.`,
        "You'll get an email as soon as the odds are posted for that week.",
      ]
    : ["The next event isn't on the schedule yet. You'll get an email as soon as the odds are posted for it."];

  const sections = [
    ["🏆 This week's winner", winLines],
    ["📊 Season standings", [...story, "", ...tableText]],
    ["🎯 Best pick of the week", bestLines],
    ["⛳ Next up", nextLines],
  ];
  const body = [
    `Hi ${name},`,
    "",
    `${t.name} is in the books. Here's how the week shook out.`,
    ...sections.flatMap(([h, ls]) => ["", h.toUpperCase(), ...ls]),
  ].join("\n");
  const text = SITE_URL ? `${body}\n\n${SITE_URL}` : body;

  // HTML: same words, with a real table for the standings.
  const P = (s) => `<p style="margin:0 0 6px">${escHtml(s)}</p>`;
  const H = (s) => `<h3 style="margin:20px 0 6px;font-size:16px;color:#0b3d2c">${escHtml(s)}</h3>`;
  const td = (s, x = "") => `<td style="padding:4px 10px;border-bottom:1px solid #e5e5e5;${x}">${escHtml(s)}</td>`;
  const th = (s, x = "") => `<th style="padding:4px 10px;border-bottom:2px solid #0b3d2c;text-align:left;${x}">${escHtml(s)}</th>`;
  const R = "text-align:right;font-variant-numeric:tabular-nums";
  const tableHtml = `<table style="border-collapse:collapse;font-size:14px;margin-top:8px"><tr>${th("#")}${th("Player")}${th("Points", R)}${th("Week", R)}${th("Move", R)}</tr>${d.table
    .map(
      (r) =>
        `<tr>${td(rankText(r))}${td(r.name, r.rank === 1 ? "font-weight:600" : "")}${td(fmtPts(r.tot), R)}${td(r.week ? `+${fmtPts(r.week)}` : "—", R)}${td(moveText(r), R + (r.rank < r.prev ? ";color:#1a7f37" : r.rank > r.prev ? ";color:#c0392b" : ""))}</tr>`,
    )
    .join("")}</table>`;
  const link = SITE_URL
    ? `<p style="margin-top:20px"><a href="${escHtml(SITE_URL)}">Open Green Jackets Pick'em</a></p>`
    : "";
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">${P(`Hi ${name},`)}${P(`${t.name} is in the books. Here's how the week shook out.`)}${H(sections[0][0])}${winLines.map(P).join("")}${H(sections[1][0])}${story.map((s) => P(s.trim())).join("")}${tableHtml}${H(sections[2][0])}${bestLines.map(P).join("")}${H(sections[3][0])}${nextLines.map(P).join("")}${link}</div>`;
  return { subject, text, html };
}

/* The next event after tournament t from the saved season schedule, with its venue.
   Venue comes from a hand-imported schedule if it has one, otherwise from ESPN. Never throws. */
async function nextEvent(db, t) {
  try {
    const y = +t.date.slice(0, 4);
    const docs = await Promise.all([y, y + 1].map((x) => db.doc(`schedule/${x}`).get()));
    const after = Date.parse(t.date) + 4 * DAY; // skip events in the same week (opposite-field)
    const ev = docs
      .flatMap((d) => d.data()?.events || [])
      .filter((e) => e.start && Date.parse(String(e.start).slice(0, 10)) >= after)
      .sort((a, b) => String(a.start).localeCompare(String(b.start)))[0];
    if (!ev) return null;
    return { name: ev.name, start: ev.start, location: ev.venue || (await espnVenue(ev.id)) };
  } catch (e) {
    console.warn(`Couldn't work out next week's event: ${e.message}`);
    return null;
  }
}
async function espnVenue(id) {
  if (!/^\d+$/.test(String(id || ""))) return "";
  try {
    const get = async (u) => {
      const r = await fetch(String(u).replace(/^http:/, "https:"), {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    };
    const ev = await get(`https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/${id}`);
    const ref = [].concat(ev.venues || [])[0]?.$ref;
    if (!ref) return "";
    const v = await get(ref),
      a = v.address || {};
    const place = [a.city, a.country === "USA" ? a.state : a.country].filter(Boolean).join(", ");
    return [v.fullName, place].filter(Boolean).join(", ");
  } catch (e) {
    console.warn(`Couldn't read ESPN venue for event ${id}: ${e.message}`);
    return "";
  }
}

/* Send the results email for tournament `id`, once. `doc` (optional) overrides the saved tournament
   fields, so a dry run can preview results that haven't been written yet. force=true sends again. */
export async function notifyResults({ admin, id, dry, force, doc }) {
  const db = admin.firestore(),
    stateRef = db.doc(`notifications/${id}`),
    state = await stateRef.get();
  if (state.data()?.resultsSentAt && !force) {
    console.log(`Results email for ${id} already went out. Not sending again.`);
    return;
  }
  const [ts, ps, us] = await Promise.all(
    ["tournaments", "picks", "users"].map((c) => db.collection(c).get()),
  );
  const tours = ts.docs.map((d) => ({ id: d.id, ...d.data(), ...(d.id === id ? doc : {}) }));
  const t = tours.find((x) => x.id === id);
  if (!t) throw new Error(`No tournament ${id}`);
  const data = buildResults({
    id,
    tours,
    picks: ps.docs.map((d) => d.data()),
    users: us.docs.map((d) => ({ uid: d.id, name: d.data().name })),
    next: await nextEvent(db, t),
  });
  const to = await recipients(admin);
  console.log(`Email: "${t.name} results" to ${to.length} user(s).`);
  if (!to.length) return;
  if (dry) {
    const m = composeResults(data, to[0].name);
    console.log(`[dry run] no email sent. Sample:\nSubject: ${m.subject}\n${m.text}`);
    return;
  }
  const sent = await sendAll(to, (r) => composeResults(data, r.name));
  if (sent) await stateRef.set({ resultsSentAt: Date.now() }, { merge: true });
}
