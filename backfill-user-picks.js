// One-off: create the userPicks record for every existing pick.
// The Firestore rules only let someone change golfers through their userPicks record,
// so picks saved before that record existed need one, or their owner could add a second pick.
// Safe to run more than once. Needs FIREBASE_SERVICE_ACCOUNT (same secret as sync.js).
//   DRY=1  show what would be written, but write nothing
import admin from "firebase-admin";
const { FIREBASE_SERVICE_ACCOUNT, DRY } = process.env;
if (!FIREBASE_SERVICE_ACCOUNT) {
  console.error("Set FIREBASE_SERVICE_ACCOUNT to the service account JSON.");
  process.exit(1);
}
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)),
});
const db = admin.firestore();

const [picks, existing] = await Promise.all([
  db.collection("picks").get(),
  db.collection("userPicks").get(),
]);
const have = new Map(existing.docs.map((d) => [d.id, d.data().key]));
const byUser = new Map(); // "<tid>__<uid>" -> [pick, ...]
for (const d of picks.docs) {
  const p = d.data(),
    id = `${p.tid}__${p.uid}`;
  if (!byUser.has(id)) byUser.set(id, []);
  byUser.get(id).push(p);
}

let writes = 0,
  batch = db.batch();
for (const [id, list] of byUser) {
  if (list.length > 1) {
    // Someone already holds two golfers in one tournament. Leave it for the admin to clear one.
    console.log(
      `SKIPPED ${id}: ${list[0].who} has ${list.length} picks (${list.map((p) => p.name).join(", ")}). Clear the extra one, then run this again.`,
    );
    continue;
  }
  const p = list[0];
  if (have.get(id) === p.key) continue;
  console.log(`${DRY ? "Would write" : "Writing"} userPicks/${id} -> ${p.name}`);
  batch.set(db.doc(`userPicks/${id}`), { tid: p.tid, uid: p.uid, key: p.key });
  writes++;
  if (writes % 400 === 0 && !DRY) {
    await batch.commit(); // Firestore caps a batch at 500 writes
    batch = db.batch();
  }
}
if (writes % 400 && !DRY) await batch.commit();
console.log(`${writes} record(s) ${DRY ? "to write" : "written"}. ${picks.size} picks checked.`);
