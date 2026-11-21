# A Plain-English Tour of `sync.js`

This guide walks through [`sync.js`](../sync.js), the behind-the-scenes script that keeps the league's leaderboard up to date during a tournament. It's written for someone with no coding experience, so the goal isn't to explain every symbol. It's to help you open the file, find a section, and understand what it's doing and why.

Line numbers are included so you can jump straight to each part. (They're accurate as of November 2026.)

If you haven't read it yet, the companion [guide to `index.html`](index-html-guide.md) explains the website itself.

---

## The big picture

The website ([`index.html`](../index.html)) is what people *look at*. `sync.js` is a worker that runs **behind the scenes** and never shows up on screen.

Its job, in one sentence:

> **Every 5 minutes during a tournament, check ESPN's live golf leaderboard, and copy everyone's position, score, and holes played into the league's database.**

Because the website is "subscribed" to the database, those updates show up on everyone's screen within seconds. Nobody has to paste anything in by hand.

The whole trip looks like this:

```
 ESPN's public leaderboard  ──►  sync.js  ──►  Firestore database  ──►  the website
   (scores, positions)        (translates)     (the league's data)    (everyone's screen)
```

### Who runs it?

Nobody runs it by hand. A **GitHub Action** (an automated task hosted by GitHub) starts it on a schedule. That schedule lives in a separate file, [`.github/workflows/sync.yml`](../.github/workflows/sync.yml), and says:

> Every 5 minutes, from 5:00 AM to 10:59 PM Central time, on Thursday, Friday, Saturday, and Sunday.

The late cutoff covers West Coast tournaments that finish in the evening. The script itself also checks whether a tournament has *actually* started, so the early-morning runs exit right away and do nothing until the first group tees off.

You can also start it by hand from the **Actions** tab on GitHub, using the safe "preview" and "dry run" options explained below.

### How it's organized

| Part | Lines | What it does |
| --- | --- | --- |
| Opening notes and setup | 1–14 | Explains the script, loads tools, and stores ESPN's web addresses. |
| Helper tools | 15–37 | Small tools for cleaning up names and scores. |
| `analyse` | 38–81 | Turns ESPN's raw data into positions, scores, and holes played. |
| `getCut` | 82–100 | Fetches the cut line (projected or final). |
| `preview` | 101–123 | The "just show me" safe mode. |
| The main routine | 124–259 | Does the actual work, step by step. |

---

## Part 1: Opening notes and setup — lines [1–14](../sync.js#L1-L14)

### The notes at the top — lines [1–6](../sync.js#L1-L6)

The first several lines start with `//`, which marks them as **comments**: notes for humans that the computer ignores. They say:

- This script copies the live ESPN leaderboard into Firestore (the league's database).
- It needs one secret, `FIREBASE_SERVICE_ACCOUNT`, which works like a key to the database. ESPN's data is public, so no key is needed for that side.
- There are two optional safe modes for testing, `PREVIEW` and `DRY` (more on these below).

> **A small out-of-date note:** line 2 says odds, field, and tee times come from "your Wednesday paste in the Admin tab." That was true originally, but now [`pga-setup.js`](../pga-setup.js) fills those in automatically. The Admin paste box is just the backup. The comment is harmless, it's just old.

### Loading the database tool — line [7](../sync.js#L7)

```js
import admin from "firebase-admin";
```

This borrows Google's **Firebase Admin** toolkit, which lets the script sign in to the database with full permission and read or save data.

One difference from the website: the website signs in as a *regular person*, so the database's security rules limit what it can do. This script signs in as an **administrator** using the secret key, so it's allowed to update any tournament. That's why the key is kept as a GitHub secret and never put in the code.

### Reading the settings — line [8](../sync.js#L8)

```js
const { FIREBASE_SERVICE_ACCOUNT, DRY, PREVIEW } = process.env;
```

Grabs three settings handed to the script when it starts (these are called **environment variables**): the secret database key, and whether either safe mode is switched on. The GitHub Action fills these in.

### ESPN's addresses — lines [9–14](../sync.js#L9-L14)

- **`SCOREBOARD`** — the web address of ESPN's golf scoreboard. This is the main source: it lists this week's tournament(s), every golfer, their scores, and the season calendar.
- **`LEADERBOARD`** — a second ESPN address with one extra thing the scoreboard lacks: **the cut line**. (It's the same feed espn.com uses for its own leaderboard page.)
- **`DAY`** — the number of milliseconds in one day (`864e5` is shorthand for 86,400,000). Computers often measure time in milliseconds, so this makes date math easier to read later.

---

## Part 2: Helper tools — lines [15–37](../sync.js#L15-L37)

Small, single-purpose tools used throughout the script.

- **`norm`** (lines [16–23](../sync.js#L16-L23)) — "normalizes" a golfer's name so two spellings can be compared fairly. It removes accents, lowercases everything, and strips punctuation. The comment shows examples: "Sami Välimäki" becomes "sami valimaki", and "J.J. Spaun" becomes "jj spaun". Without this, ESPN and the league's list might spell the same golfer slightly differently and fail to match.
- **`toPar`** (lines [24–28](../sync.js#L24-L28)) — turns a golf score written as text ("E", "-7", "+2") into a real number (0, -7, 2) so the computer can compare who's ahead.
- **`fmtScore`** (lines [29–30](../sync.js#L29-L30)) — the reverse: turns a number back into golf-style text for display (0 becomes "E", 2 becomes "+2").
- **`words`** and **`overlap`** (lines [31–37](../sync.js#L31-L37)) — count how many meaningful words two tournament names share. "Masters Tournament" and "The Masters" share one ("masters"). This is how the script figures out which ESPN event matches which league tournament, even if the names aren't identical. Words of 2 letters or fewer (like "of" or "at") are ignored.

---

## Part 3: Making sense of ESPN's data (`analyse`) — lines [38–81](../sync.js#L38-L81)

ESPN's data is a big, deeply nested pile of information. **`analyse`** takes one tournament from that pile and boils it down to what the league cares about. It's the most important piece of logic in the file.

### Step 1: Read each golfer — lines [40–63](../sync.js#L40-L63)

For every golfer in the tournament, it collects:

- **Name**
- **Score to par** (using `toPar`)
- **Round-by-round info**: which round, how many holes they've played in it, and which hole they started on
- **"Thru"** — how many holes they've played in their current round. ESPN's data doesn't include this directly, so the script works it out:
  - **"F"** if they've finished all 18 holes
  - otherwise the number of holes played, like **"12"**
  - with a **"\*"** added if they started on a hole other than 1. For example, a golfer who teed off on the back nine (hole 10) and has played 4 holes shows **"4\*"**. This matches how ESPN's own website shows it.

### Step 2: Figure out who's out — lines [64–75](../sync.js#L64-L75)

Golfers who miss the cut, withdraw, or are disqualified earn **0 points**, so the script needs to spot them. It first works out the **latest round** anyone has started. Once that's round 3 or later, the cut has happened. Then for each golfer it checks three things:

1. **Does ESPN's status say they're out?** It looks for words like CUT, WITHDRAW, WD, or DISQ.
2. **The cut has happened, but they never started round 3?** They probably missed the cut.
3. **They stopped partway through a round while everyone else moved on to the next round?** They probably withdrew.

If any of these is true, the golfer is marked as **out**, along with a short reason (used in the preview printout).

### Step 3: Work out positions — lines [76–79](../sync.js#L76-L79)

Among everyone still in, it ranks golfers by score. **Ties share the better position**: a golfer's position is 1 plus the number of golfers with a strictly better score. So if two golfers are tied behind two others, both are 3rd (shown as "T3" on TV), and both earn points as if they finished 3rd. This matches the league's scoring rules.

### What it hands back — line [80](../sync.js#L80)

The list of golfers with all of the above, the latest round being played, and a yes/no for "has anyone started playing yet?"

---

## Part 4: The cut line (`getCut`) — lines [82–100](../sync.js#L82-L100)

**`getCut`** asks ESPN's second address (`LEADERBOARD`) for the **cut line**, the score golfers need to make it to the weekend. It returns the cut score, which round the cut is made after, and how many players are projected to make it.

The script later marks the cut as **final** once the next round has started. Until then it's a **projected** cut. On the website, this shows up next to the tournament name as "Projected Cut: +2" or "Cut: +2".

Two design choices worth noticing:

- **It never crashes the script.** The comment says it outright: "a failure here must not stop scores from syncing." If ESPN's cut-line feed is down or acting strangely, it prints a warning and moves on without a cut line. Scores are more important than the cut line.
- **It returns nothing for events without a cut** (some events don't have one), or before ESPN has published it.

**`fmtCut`** (lines [99–100](../sync.js#L99-L100)) just turns the cut info into a readable sentence for the log, like "cut +2 (round 2, 70 players, final)".

---

## Part 5: Preview mode — lines [101–123](../sync.js#L101-L123)

**`preview`** is a safe "just show me" mode. It **doesn't touch the database at all** and doesn't even need the secret key. For each tournament ESPN currently lists, it prints:

- the tournament's name, ESPN ID, start date, number of golfers, current round, and cut line
- the **top 10** golfers with position, name, score, and holes played
- how many golfers were **flagged as out**, plus up to 15 of them and the reason

This is useful for checking that ESPN's data looks right, or that the "who's out" logic is behaving, without any risk of changing the league's data. It's what runs when you start the workflow by hand with **"Preview only"** checked (which is on by default).

---

## Part 6: The main routine — lines [124–259](../sync.js#L124-L259)

This is where the script actually does its job, top to bottom. The earlier parts were all tools; this part uses them.

### Step 1: Download ESPN's scoreboard — lines [125–137](../sync.js#L125-L137)

It downloads the scoreboard from ESPN. If ESPN doesn't answer properly, the script stops with an error. (The `User-Agent: Mozilla/5.0` bit makes the request look like an ordinary web browser, since some sites treat automated requests differently.)

From the download it pulls out:
- **`events`** — the tournament(s) happening this week
- **`season`** — the season year
- **`calendar`** — the full season schedule (every event's name and dates)

### Step 2: If in preview mode, show and stop — lines [138–142](../sync.js#L138-L142)

If `PREVIEW` is on, it prints the calendar size, runs the preview from Part 5, and exits. Nothing else happens.

### Step 3: Connect to the database — lines [143–148](../sync.js#L143-L148)

If the secret key is missing, it stops with a clear error. Otherwise it signs in to Firestore as an administrator.

### Step 4: Keep the season schedule up to date — lines [149–168](../sync.js#L149-L168)

As a bonus job, it saves ESPN's season calendar to the database so the website's **Schedule tab** can list every event. It's careful about this:

- It **only saves when something has changed**, so it isn't rewriting the same data every 5 minutes.
- It **never overwrites a schedule the commissioner imported by hand** (through the Admin tab's "Import season schedule" box). A hand-made schedule is marked `"manual"`, and the script leaves those alone.

### Step 5: Stop if ESPN has nothing this week — lines [169–172](../sync.js#L169-L172)

If ESPN lists no events (an off week), it says so and exits.

### Step 6: Find which league tournaments are live — lines [173–194](../sync.js#L173-L194)

It loads all of the league's tournaments from the database and keeps only those that are **live right now**, meaning:

1. Today is on or after Round 1's date,
2. it's no more than 4½ days after Round 1 (covering Thursday through about Monday midday, in case of weather delays), and
3. **the first group has actually teed off**, based on the earliest tee time saved for the tournament.

That third check is what the comment calls making the schedule "dynamic." The GitHub Action wakes up early Thursday morning, but this check makes those early runs quietly exit until real golf has started. If nothing is live, it says so and exits.

### Step 7: Update each live tournament — lines [195–259](../sync.js#L195-L259)

For each live tournament, it does the following. The whole thing is wrapped in a safety net (`try` / `catch`), so if one tournament has a problem, it logs the error and still moves on to the next. (This matters in weeks with two events, like an opposite-field event.)

**a. Skip team events** — lines [199–202](../sync.js#L199-L202). If any "golfer" name contains a slash (like "Smith / Jones"), it's a two-person team event. ESPN's data doesn't fit that format, so the script skips it and leaves it for the commissioner's Admin paste box.

**b. Find the matching ESPN event** — lines [203–213](../sync.js#L203-L213). It looks for ESPN events that start within a day of the league tournament, then picks the one whose name shares the most words (using `overlap`). If there are several candidates and none share a word, it gives up rather than guess wrong.

**c. Make sure play has started** — lines [214–218](../sync.js#L214-L218). It runs `analyse` on the ESPN event. If ESPN has no scores yet, it skips for now.

**d. Match ESPN's golfers to the league's golfers** — lines [219–246](../sync.js#L219-L246). This is the trickiest step, because ESPN and the league's list might write names a little differently. For each ESPN golfer it tries:

1. **The full name** (after cleaning it up with `norm`).
2. If that fails, **last name + first initial**. "Scheffler" + "S" would match "Scottie Scheffler" even if one list wrote "Scott Scheffler."
   - But if two golfers in the field share the same last name and first initial, this backup is turned off for them, so the script never mixes them up.

For each golfer it matches, it records:
- **Result** — their position, or **0** if they're out. This is what the points are calculated from.
- **Live info** — their score and holes played, shown in the Score and Thru columns on the website.

ESPN golfers who aren't in the league's field are simply counted and skipped.

**e. Get the cut line** — lines [247–248](../sync.js#L247-L248). Calls `getCut` from Part 4 and marks it final once the next round has started.

**f. Save, or just report** — lines [249–254](../sync.js#L249-L254). It builds a one-line summary, such as: "Masters (2026-04-09): matched 89 of 91 entries to ESPN "Masters Tournament" (0 ESPN golfers not in your field), 0 flagged out, cut +2 (round 2, 54 players)."

- In **dry-run mode** (`DRY`), it prints that summary with "[dry run]" in front and **saves nothing**.
- Otherwise it **saves** the results, the live scores, the cut line, and the current time to the database. That time is what powers the "Leaderboard updated 2:14 PM (3 min ago)" line on the Picks tab.

**g. If anything went wrong** — lines [255–258](../sync.js#L255-L258). It prints the error and marks the run as failed, so GitHub shows a red ❌ in the Actions tab. That's your signal to take a look.

---

## The two safe modes, side by side

| Mode | How to turn it on | Reads ESPN? | Reads the database? | Saves anything? | Good for |
| --- | --- | --- | --- | --- | --- |
| **Preview** | `PREVIEW=1`, or "Preview only" in the Actions tab | ✅ | ❌ | ❌ | Seeing what ESPN is reporting right now. |
| **Dry run** | `DRY=1`, or "Dry run" in the Actions tab | ✅ | ✅ | ❌ | Seeing exactly what *would* be saved for the league's tournaments. |
| **Normal** | Neither (how the 5-minute schedule runs) | ✅ | ✅ | ✅ | Actually updating the leaderboard. |

---

## Quick reference: "Where do I change…?"

| I want to change… | Look here |
| --- | --- |
| How often it runs, or which days and hours | [`.github/workflows/sync.yml`](../.github/workflows/sync.yml), the `cron` line |
| Where the leaderboard data comes from | `SCOREBOARD` and `LEADERBOARD`, lines [9–13](../sync.js#L9-L13) |
| How "Thru" is displayed (e.g. the `*` for back-nine starts) | Lines [48–54](../sync.js#L48-L54) |
| What counts as "out" (missed cut, withdrew, DQ) | Lines [66–75](../sync.js#L66-L75) |
| How ties are ranked | Lines [76–79](../sync.js#L76-L79) |
| How long a tournament stays "live" (currently 4½ days) | Line [185](../sync.js#L185) |
| How golfer names are matched | Lines [219–241](../sync.js#L219-L241) |
| Whether a hand-imported schedule can be overwritten | Lines [153–158](../sync.js#L153-L158) |

> **Note:** the scoring formula itself (odds ÷ position ÷ 100 × multiplier) is **not** in this file. `sync.js` only saves positions. The website does the points math. See section 3.7 of the [`index.html` guide](index-html-guide.md).

---

## Mini glossary

| Term | Meaning |
| --- | --- |
| **Script** | A program that runs, does a job, and stops. It has no screen. |
| **GitHub Action / workflow** | An automated task GitHub runs for you on a schedule or on request. |
| **Cron** | A compact way of writing a schedule, like "every 5 minutes on Thu–Sun." |
| **Environment variable** | A setting handed to a script when it starts, like `DRY=1`. |
| **Secret** | A setting stored privately in GitHub (like the database key) so it never appears in the code. |
| **Service account** | A "robot" login with admin permission to the database. |
| **Firestore** | The league's online database, run by Google's Firebase. |
| **Fetch** | Download data from a web address. |
| **To par** | A golf score relative to par: "E" is even, "-5" is five under. |
| **Thru** | How many holes a golfer has played in the current round. "F" means finished. |
| **Dry run** | A practice run that shows what would happen without changing anything. |
| **`try` / `catch`** | A safety net: "try this, and if it fails, handle the error instead of crashing." |
