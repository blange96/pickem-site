// Green Jackets Pick'em: builds the weekly tournament (field + R1 tee times + FanDuel odds) from pgatour.com
// and saves it to Firestore, so you no longer paste the Wednesday table in Admin.
// Env: FIREBASE_SERVICE_ACCOUNT, PGA_API_KEY (public site key), TOURNAMENT_ID (optional, e.g. R2026558),
//      DRY=1 (show what would be saved, write nothing), SELFTEST=1 (fake data, no network)
// Safety: never writes once the first group has teed off (odds go live after that and would change).
import { gunzipSync } from "node:zlib";
const { FIREBASE_SERVICE_ACCOUNT, PGA_API_KEY, TOURNAMENT_ID, DRY, SELFTEST } = process.env;
const GQL = "https://orchestrator.pgatour.com/graphql";
const HEAD = { "Content-Type": "application/json", Accept: "application/graphql-response+json, application/json",
 "x-pgat-platform": "web", Origin: "https://www.pgatour.com", Referer: "https://www.pgatour.com/", "User-Agent": "Mozilla/5.0",
 ...(PGA_API_KEY ? { "x-api-key": PGA_API_KEY } : {}) };
const Q = {
 field: `query Field($fieldId: ID!, $includeWithdrawn: Boolean, $changesOnly: Boolean) { field(id: $fieldId, includeWithdrawn: $includeWithdrawn, changesOnly: $changesOnly) { tournamentName id players { id firstName lastName displayName withdrawn status alternate } } }`,
 tee: `query TeeTimesCompressedV2($teeTimesCompressedV2Id: ID!) { teeTimesCompressedV2(id: $teeTimesCompressedV2Id) { id payload } }`,
 odds: `query oddsToWinCompressed($tournamentId: ID!) { oddsToWinCompressed(oddsToWinId: $tournamentId) { id payload } }`,
};
/* ---------- helpers (keyOf is identical to the app's) ---------- */
const keyOf = n => n.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const words = s => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2));
const overlap = (a, b) => [...words(a)].filter(w => words(b).has(w)).length;
const ABBR = { EST: "America/New_York", EDT: "America/New_York", CST: "America/Chicago", CDT: "America/Chicago", MST: "America/Denver", MDT: "America/Denver",
 PST: "America/Los_Angeles", PDT: "America/Los_Angeles", HST: "Pacific/Honolulu", HDT: "Pacific/Honolulu" };
const APP_TZ = new Set(["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Pacific/Honolulu"]);
const pickTz = raw => {
 const s = String(raw || "").trim(), z = s.includes("/") ? s : ABBR[s.toUpperCase()];
 if (z) { try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return APP_TZ.has(z) ? z : "America/New_York"; } catch {} }
 return null;
};
const ymd = (ms, tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(ms));
const unpack = p => JSON.parse(gunzipSync(Buffer.from(p, "base64")).toString("utf8"));
async function gql(query, variables, root) {
 const r = await fetch(GQL, { method: "POST", headers: HEAD, body: JSON.stringify({ query, variables }) });
 if (!r.ok) throw new Error(`pgatour.com returned HTTP ${r.status} for ${root}`);
 const j = await r.json(), d = j.data?.[root];
 if (!d) throw new Error(`No data for ${root}: ${JSON.stringify(j.errors || {}).slice(0, 200)}`);
 return d.payload ? unpack(d.payload) : d;
}
/* ---------- combine the three feeds into the app's tournament shape ---------- */
function build(field, tee, odds) {
 const r1 = (tee.rounds || []).find(r => r.roundInt === 1);
 if (!r1) throw new Error("No round 1 tee times published yet.");
 const teeById = new Map();
 for (const g of r1.groups || []) for (const p of g.players || []) teeById.set(String(p.id), g.teeTime);
 const oddsById = new Map((odds.players || []).map(p => [String(p.playerId), parseInt(String(p.odds).replace("+", ""), 10)]));
 const entries = [], noOdds = [], noTee = [];
 for (const p of field.players || []) {
   if (p.withdrawn || p.alternate) continue;
   const name = `${p.firstName || ""} ${p.lastName || ""}`.trim(), id = String(p.id);
   const o = oddsById.get(id), t = teeById.get(id);
   if (t == null) { noTee.push(name); continue; }
   if (o == null || isNaN(o)) { noOdds.push(name); continue; }
   entries.push({ name, key: keyOf(name), odds: o, tee: t });
 }
 const tm = {}; entries.forEach(e => tm[e.key] = e.tee);
 return { entries, tee: tm, noOdds, noTee, firstTee: Math.min(...[...teeById.values()]) };
}
function typeFor(name, date, events) {
 const ev = (events || []).filter(e => e.type && e.start && Math.abs(Date.parse(String(e.start).slice(0, 10)) - Date.parse(date)) <= 2 * 864e5)
   .sort((a, b) => overlap(name, b.name) - overlap(name, a.name))[0];
 if (ev && overlap(name, ev.name)) return { type: ev.type, why: `schedule: ${ev.name}` };
 if (/masters|pga championship|u\.?s\.? open|open championship/i.test(name) && !/senior|women|junior/i.test(name)) return { type: "major", why: "name looks like a major" };
 return { type: "regular", why: "not found in your schedule, defaulting to regular (change it in Admin if wrong)" };
}
/* ---------- self test: fake data, no network ---------- */
if (SELFTEST) {
 const field = { tournamentName: "Test Open", players: [
   { id: "1", firstName: "Zach", lastName: "Bauchou" }, { id: "2", firstName: "Dan", lastName: "Berger" },
   { id: "3", firstName: "No", lastName: "Odds" }, { id: "4", firstName: "Out", lastName: "Withdrawn", withdrawn: true }] };
 const tee = { rounds: [{ roundInt: 1, groups: [{ teeTime: 1794488400000, players: [{ id: 1 }, { id: 2 }] }, { teeTime: 1794490000000, players: [{ id: 3 }] }] }] };
 const odds = { players: [{ playerId: "1", odds: "+3300" }, { playerId: "2", odds: "+100000" }] };
 console.log(JSON.stringify(build(field, tee, odds), null, 1));
 console.log(pickTz("America/Chicago"), pickTz("CDT"), pickTz("Europe/London"), pickTz("weird"), ymd(1794488400000, "America/Chicago"));
 console.log(typeFor("The Masters", "2027-04-08", []), typeFor("Fake Classic", "2027-04-08", [{ name: "Fake Classic", type: "signature", start: "2027-04-08" }]));
 process.exit(0);
}
/* ---------- main ---------- */
if (!PGA_API_KEY) throw new Error("Missing PGA_API_KEY secret");
if (!FIREBASE_SERVICE_ACCOUNT) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT");
let tid = TOURNAMENT_ID;
if (!tid) {
 const c = await (await fetch("https://orchestrator-config.pgatour.com/web-config", { headers: { "User-Agent": "Mozilla/5.0" } })).json();
 tid = c?.defaultTournaments?.R?.[0]?.leaderboardId;
}
if (!tid) throw new Error("Could not find the current tournament id. Re-run with TOURNAMENT_ID.");
const [field, tee, odds] = await Promise.all([
 gql(Q.field, { fieldId: tid, includeWithdrawn: true, changesOnly: false }, "field"),
 gql(Q.tee, { teeTimesCompressedV2Id: tid }, "teeTimesCompressedV2"),
 gql(Q.odds, { tournamentId: tid }, "oddsToWinCompressed"),
]);
console.log(`${field.tournamentName} (${tid})`);
if (/zurich/i.test(field.tournamentName) || (field.players || []).some(p => /\//.test(`${p.firstName}${p.lastName}`))) { console.log("Team event: use the Admin paste box for this one."); process.exit(0); }
if (!odds.oddsEnabled) { console.log("Odds are not posted yet. Try again later."); process.exit(0); }
const b = build(field, tee, odds);
if (Date.now() >= b.firstTee) { console.log("The first group has already teed off. Not touching this tournament."); process.exit(0); }
if (!b.entries.length) { console.log("No golfers with both odds and a tee time yet."); process.exit(0); }
const tz = pickTz(tee.timezone) || "America/New_York";
if (!pickTz(tee.timezone)) console.log(`Unrecognised time zone "${tee.timezone}", using Eastern (only affects displayed tee times).`);
const date = ymd(b.firstTee, tz);
const admin = (await import("firebase-admin")).default;
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const sched = await db.doc(`schedule/${date.slice(0, 4)}`).get();
const { type, why } = typeFor(field.tournamentName, date, sched.data()?.events);
const id = `${keyOf(field.tournamentName)}_${date}`, ref = db.doc(`tournaments/${id}`), cur = await ref.get();
const doc = { name: field.tournamentName, type: cur.exists ? cur.data().type : type, date, tz, entries: b.entries, tee: b.tee, results: cur.data()?.results || {} };
console.log(`Tournament doc: ${id} | type ${doc.type} (${cur.exists ? "kept from existing doc" : why}) | Thursday ${date} | ${b.entries.length} golfers`);
if (b.noOdds.length) console.log(`  skipped, no odds posted (${b.noOdds.length}): ${b.noOdds.slice(0, 12).join(", ")}`);
if (b.noTee.length) console.log(`  skipped, no tee time yet (${b.noTee.length}): ${b.noTee.slice(0, 12).join(", ")}`);
b.entries.slice(0, 5).forEach(e => console.log(`  ${e.name}: +${e.odds}, tees ${new Date(e.tee).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })}`));
if (DRY) console.log("[dry run] nothing written.");
else { await ref.set(doc); console.log("Saved."); }
