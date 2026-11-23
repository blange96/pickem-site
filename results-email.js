// Green Jackets Pick'em: send (or preview) the end-of-tournament results email by hand.
// sync.js sends it automatically when ESPN marks a tournament complete. Use this to preview it,
// to send it for a tournament that went final before the automatic email existed, or to re-send it.
// Env: FIREBASE_SERVICE_ACCOUNT, SMTP_* / MAIL_FROM / SITE_URL (same as notify.js)
//      TOURNAMENT_ID  tournament doc id, e.g. the_rsm_classic_2026-11-19 (blank = most recent final one)
//      DRY=1          print a sample email, send nothing
//      FORCE=1        send even if this tournament's results email already went out
//      SELFTEST=1     fake data, no network: just print the email
import { buildResults, composeResults, notifyResults } from "./notify.js";
const { FIREBASE_SERVICE_ACCOUNT, TOURNAMENT_ID, DRY, FORCE, SELFTEST } =
  process.env;

if (SELFTEST) {
  const users = [
    { uid: "a", name: "Pat" },
    { uid: "b", name: "Sam" },
    { uid: "c", name: "Alex" },
    { uid: "d", name: "Jordan" },
  ];
  const tours = [
    {
      id: "w1",
      name: "Week One Open",
      type: "regular",
      date: "2026-11-12",
      entries: [
        { key: "g1", name: "Golfer One", odds: 800 },
        { key: "g2", name: "Golfer Two", odds: 2500 },
        { key: "g3", name: "Golfer Three", odds: 4000 },
      ],
      results: { g1: 1, g2: 5, g3: 0 },
    },
    {
      id: "w2",
      name: "The Test Classic",
      type: "signature",
      date: "2026-11-19",
      entries: [
        { key: "x1", name: "Max Example", odds: 3300 },
        { key: "x2", name: "Haotong Sample", odds: 6600 },
        { key: "x3", name: "Long Shot", odds: 20000 },
        { key: "x4", name: "Favorite Guy", odds: 600 },
      ],
      results: { x1: 1, x2: 2, x3: 2, x4: 0 },
    },
  ];
  const picks = [
    { tid: "w1", uid: "a", key: "g1", name: "Golfer One" },
    { tid: "w1", uid: "b", key: "g2", name: "Golfer Two" },
    { tid: "w1", uid: "c", key: "g3", name: "Golfer Three" },
    { tid: "w2", uid: "b", key: "x1", name: "Max Example" },
    { tid: "w2", uid: "c", key: "x2", name: "Haotong Sample" },
    { tid: "w2", uid: "a", key: "x4", name: "Favorite Guy" },
  ];
  const next = {
    name: "Hero World Challenge",
    start: "2026-12-03T08:00Z",
    location: "Albany GC, New Providence, Bahamas",
  };
  const m = composeResults(buildResults({ id: "w2", tours, picks, users, next }), "Pat");
  console.log(`Subject: ${m.subject}\n\n${m.text}\n\n--- html ${m.html.length} chars`);
  process.exit(0);
}

if (!FIREBASE_SERVICE_ACCOUNT)
  throw new Error("Missing FIREBASE_SERVICE_ACCOUNT");
const admin = (await import("firebase-admin")).default;
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)),
});
let id = TOURNAMENT_ID;
if (!id) {
  const snap = await admin.firestore().collection("tournaments").where("final", "==", true).get();
  id = snap.docs.sort((a, b) => b.data().date.localeCompare(a.data().date))[0]?.id;
  if (!id) throw new Error("No tournament is marked final yet. Re-run with a tournament id.");
}
console.log(`Tournament: ${id}${DRY ? " (dry run)" : ""}${FORCE ? " (force re-send)" : ""}`);
await notifyResults({ admin, id, dry: !!DRY, force: !!FORCE });
