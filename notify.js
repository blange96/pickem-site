// Green Jackets Pick'em: emails every signed-up user when pga-setup.js posts or changes the week's odds.
// Env: SMTP_HOST, SMTP_PORT (default 465), SMTP_USER, SMTP_PASS, MAIL_FROM (default SMTP_USER),
//      SITE_URL (optional, linked in the email)
// State: notifications/{tournamentId} remembers whether the "odds are up" email already went out,
//        so the first email of the week is the "posted" one and every later one is an "updated" one.
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, SITE_URL } =
  process.env;

const fmtOdds = (o) => (o > 0 ? `+${o}` : String(o));
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
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log("SMTP_HOST/SMTP_USER/SMTP_PASS not set, skipping email.");
    return;
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
      await tx.sendMail({
        from: MAIL_FROM || SMTP_USER,
        to: r.email,
        ...compose({ first, doc, diff, firstTee, name: r.name }),
      });
      sent++;
    } catch (e) {
      console.log(`  failed to email user "${r.name}": ${e.message}`);
    }
  }
  console.log(`Emailed ${sent}/${to.length}.`);
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
  if (sent < to.length) process.exitCode = 1; // flag the workflow run so failures get noticed
}
