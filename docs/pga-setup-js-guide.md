# A Plain-English Tour of `pga-setup.js`

This guide walks through [`pga-setup.js`](../pga-setup.js), the behind-the-scenes script that sets up each week's tournament automatically. It's written for someone with no coding experience. You don't need to follow every symbol. The goal is that you can open the file, find a section, and understand what it's doing and why.

Line numbers are included so you can jump straight to each part. (They're accurate as of November 2026.)

Companion guides: [`index.html`](index-html-guide.md) (the website) and [`sync.js`](sync-js-guide.md) (live scores).

---

## The big picture

Before golfers can be picked, the league needs to know **who's playing this week, what their odds are, and when each of them tees off on Thursday**. That's what this script provides.

Its job, in one sentence:

> **Early in the week, get the tournament field, Round 1 tee times, and betting odds from pgatour.com, combine them into one list, save it to the league's database, and email everyone when the odds are posted or change.**

Before this script existed, the commissioner had to copy a table from the PGA Tour website every Wednesday night and paste it into the Admin tab. That paste box still exists as a backup, but normally this script does the work.

```
 pgatour.com                     pga-setup.js                Firestore            everyone
 ┌──────────────┐               ┌──────────────┐           ┌──────────┐        ┌────────┐
 │ field        │──┐            │ combine into │           │ this     │        │ "Odds  │
 │ tee times    │──┼──────────► │ one golfer   │─────────► │ week's   │──────► │ are    │
 │ odds         │──┘            │ list         │           │ event    │ email  │ up!"   │
 └──────────────┘               └──────────────┘           └──────────┘        └────────┘
```

### How the three jobs fit together

| Script | When | Job |
| --- | --- | --- |
| **`pga-setup.js`** (this one) | Tue & Wed | Sets up the tournament: field, odds, tee times. |
| [`sync.js`](../sync.js) | Thu–Mon, every 5 min | Fills in live scores and positions. |
| [`index.html`](../index.html) | Always | Shows everything and lets people pick. |

### Who runs it?

A **GitHub Action** (an automated task hosted by GitHub) starts it. The schedule lives in [`.github/workflows/pga-setup.yml`](../.github/workflows/pga-setup.yml):

> At 7:07 AM and 6:07 PM Central time, on Tuesday and Wednesday.

Running four times gives pgatour.com a few chances to post the odds and tee times, and lets the script catch any changes (odds moving, golfers withdrawing). Once the first group tees off on Thursday, the script refuses to change anything.

You can also start it by hand from GitHub's **Actions** tab. When you do, **"Dry run" is checked by default**, so a manual run is safe unless you uncheck it. You can also type in a specific tournament ID if you want to set up an event other than the current one.

### How the file is organized

| Part | Lines | What it does |
| --- | --- | --- |
| Opening notes and setup | 1–26 | Explains the script, loads tools, prepares the requests to pgatour.com. |
| Helper tools | 27–91 | Name IDs, name matching, time zones, and the tool that talks to pgatour.com. |
| `build` | 92–133 | Combines field + tee times + odds into one golfer list. |
| `typeFor` | 134–155 | Decides if the event is regular, signature, or major. |
| Self-test | 156–214 | A practice run with made-up data. |
| The main routine | 215–321 | Does the actual work, step by step. |

---

## Part 1: Opening notes and setup — lines [1–26](../pga-setup.js#L1-L26)

### The notes at the top — lines [1–7](../pga-setup.js#L1-L7)

Lines starting with `//` are **comments**, notes for humans that the computer ignores. They summarize the script:

- It builds the weekly tournament (field, Round 1 tee times, and FanDuel odds) from pgatour.com and saves it, so the commissioner no longer pastes a table on Wednesday.
- The settings it uses (more on these below).
- **Safety rule:** it never saves anything once the first group has teed off. After that point, sportsbooks switch to live in-play odds, which change constantly. The league wants the **pre-tournament** odds locked in.
- **Email rule:** it only saves and emails when something actually changed. The first email of the week says the odds are posted; later ones list what changed.

### Loading tools — lines [8–9](../pga-setup.js#L8-L9)

- **`gunzipSync`** is an unzipping tool. pgatour.com sends some of its data compressed (like a .zip file) to save space, so this unpacks it.
- **`diffEntries`, `compose`, `notifyOdds`** are borrowed from [`notify.js`](../notify.js), the companion file that handles emails. See [Part 7](#part-7-the-email-step-notifyjs) below.

### Reading the settings — lines [10–11](../pga-setup.js#L10-L11)

These settings (**environment variables**) are handed to the script when it starts. The GitHub Action fills them in:

| Setting | What it is |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | The secret key to the league's database. |
| `PGA_API_KEY` | A key pgatour.com's own website uses to request its data. It's public (anyone's browser uses it when visiting pgatour.com) but is stored as a GitHub secret to keep it out of the code. |
| `TOURNAMENT_ID` | *Optional.* A specific PGA Tour event ID (like `R2026558`). If left blank, the script uses whatever event pgatour.com is currently featuring. |
| `DRY` | Dry-run mode: show what *would* be saved and emailed, but don't actually do it. |
| `SELFTEST` | Practice mode with made-up data. No internet or database needed. |

### Preparing requests to pgatour.com — lines [12–26](../pga-setup.js#L12-L26)

- **`GQL`** is the web address of pgatour.com's data service. (GraphQL, or "GQL," is a style of data service where you send a specific question and get back exactly the answer you asked for.)
- **`HEAD`** is a set of labels attached to every request. They make the request look like it's coming from pgatour.com's own website in an ordinary browser, which is what the data service expects.
- **`Q`** holds the three questions the script asks pgatour.com:
  1. **`field`** — Who's playing? (Names, player IDs, and whether they've withdrawn or are alternates.)
  2. **`tee`** — When does each group tee off in each round?
  3. **`odds`** — What are each golfer's odds to win?

---

## Part 2: Helper tools — lines [27–91](../pga-setup.js#L27-L91)

Small tools used throughout the script.

### Golfer IDs — lines [28–32](../pga-setup.js#L28-L32)

**`keyOf`** turns a golfer's name into a simple ID: "Scottie Scheffler" becomes `scottie_scheffler`. The comment notes it's **identical to the one in `index.html`**. That matters: the website and this script must produce the exact same ID for each golfer, or picks wouldn't line up with golfers. If you ever change one, change both.

### Name matching — lines [33–41](../pga-setup.js#L33-L41)

**`words`** and **`overlap`** count how many meaningful words two tournament names share, ignoring short words like "of" or "at." This helps match "The Masters" with "Masters Tournament" when looking up the event in the season schedule.

### Time zones — lines [42–73](../pga-setup.js#L42-L73)

Tee times should show in the **course's local time**. This group handles that:

- **`ABBR`** (lines [42–53](../pga-setup.js#L42-L53)) translates short time-zone codes like "EDT" or "PST" into full names the computer understands ("America/New_York").
- **`APP_TZ`** (lines [54–60](../pga-setup.js#L54-L60)) is the list of time zones the website supports: Eastern, Central, Mountain, Pacific, and Hawaii. It matches the time-zone dropdown on the Admin tab.
- **`pickTz`** (lines [61–71](../pga-setup.js#L61-L71)) takes whatever time zone pgatour.com reports and turns it into one of the supported ones. If it's a real time zone the site doesn't list (say, for an event in Europe), it falls back to Eastern. If it can't make sense of it at all, it returns nothing, and the main routine falls back to Eastern and logs a note.
- **`ymd`** (lines [72–73](../pga-setup.js#L72-L73)) turns a moment in time into a date like `2026-04-09`, in a given time zone. This is used to work out the date of Round 1.

> All tee times are stored as exact moments in time, so the time zone only affects how they're **displayed**. Picks still lock at the right moment even if the time zone were wrong.

### Talking to pgatour.com — lines [74–91](../pga-setup.js#L74-L91)

- **`unpack`** unzips compressed data from pgatour.com and turns it into something readable.
- **`gql`** is the messenger. It sends one of the three questions from `Q` to pgatour.com, checks that the answer came back OK, and unpacks it if it was compressed. If something goes wrong, it stops with a clear error message saying which question failed.

---

## Part 3: Combining the three feeds (`build`) — lines [92–133](../pga-setup.js#L92-L133)

pgatour.com gives back three separate lists: the field, the tee times, and the odds. **`build`** combines them into one list of golfers in the shape the website expects. This is the core of the script.

1. **Find the Round 1 tee times** (lines [94–98](../pga-setup.js#L94-L98)). If pgatour.com hasn't published Round 1 tee times yet, it stops with "No round 1 tee times published yet." Otherwise it makes a lookup table: player → tee time.
2. **Build an odds lookup** (lines [99–104](../pga-setup.js#L99-L104)): player → odds. It strips the "+" so "+5000" becomes the number 5000.
3. **Go through the field** (lines [105–123](../pga-setup.js#L105-L123)). For each golfer:
   - **Skip** them if they've **withdrawn** or are only an **alternate** (on standby in case someone drops out).
   - If they have **no tee time**, put them on a "no tee time" list and skip them.
   - If they have **no odds**, put them on a "no odds" list and skip them.
   - Otherwise, **add them** with their name, ID, odds, and tee time.

   So only golfers with **both** odds and a tee time can be picked. The skipped lists are printed in the log so you can see who was left out and why.
4. **Hand back the results** (lines [124–132](../pga-setup.js#L124-L132)): the golfer list, a quick tee-time lookup, the two skipped lists, and **`firstTee`**, the earliest tee time of the day. That last one drives the "don't touch it after play starts" safety rule.

---

## Part 4: Deciding the event type (`typeFor`) — lines [134–155](../pga-setup.js#L134-L155)

The event type sets the points multiplier: **regular (1×), signature (1.25×), or major (2×)**. **`typeFor`** figures it out, in this order:

1. **Check the season schedule** (lines [135–145](../pga-setup.js#L135-L145)). It looks for an event in the league's saved schedule that starts within 2 days of this one and shares at least one word in its name. If it finds one, it uses that event's type. This is the most reliable source, since it comes from the schedule the commissioner imported.
2. **Does the name look like a major?** (lines [146–150](../pga-setup.js#L146-L150)) If the name mentions the Masters, PGA Championship, U.S. Open, or Open Championship, and *isn't* a senior, women's, or junior event, it's treated as a major.
3. **Otherwise, regular** (lines [151–154](../pga-setup.js#L151-L154)), with a note in the log saying to change it on the Admin tab if that's wrong.

It also returns a short reason ("schedule: Masters Tournament," "name looks like a major," etc.) that's printed in the log, so you can see *why* it chose that type.

---

## Part 5: The self-test — lines [156–214](../pga-setup.js#L156-L214)

When `SELFTEST` is turned on, the script runs a **practice round with made-up data** instead of contacting pgatour.com or the database. It's a quick way to check the logic still works after someone edits the code.

The fake data is a tiny "Test Open" with four golfers designed to test the edge cases:
- **Zach Bauchou** and **Dan Berger** — normal golfers with odds and tee times (included).
- **"No Odds"** — has a tee time but no odds (should be skipped).
- **"Out Withdrawn"** — has withdrawn (should be skipped).

It then prints the results of:
- `build` — so you can confirm only the two valid golfers made it.
- `pickTz` — on a few sample time zones, including a European one and a nonsense one.
- `typeFor` — confirming "The Masters" is a major and a schedule match picks up "signature."
- The change-detection from `notify.js` — confirming that the same list in a different order counts as **no change**, while a changed odds line and a new golfer **do** count.
- **Sample emails** — both the "odds are up" version and the "odds updated" version, so you can read exactly what people would receive.

Then it stops. Nothing is saved and nothing is sent.

To run it on your own computer (from the README):

```powershell
$env:SELFTEST = "1"; node pga-setup.js
```

---

## Part 6: The main routine — lines [215–321](../pga-setup.js#L215-L321)

This is where the script does its real work, top to bottom.

### Step 1: Check the keys are present — lines [216–218](../pga-setup.js#L216-L218)

If either the pgatour.com key or the database key is missing, it stops right away with a clear message.

### Step 2: Figure out which tournament — lines [219–231](../pga-setup.js#L219-L231)

If a tournament ID was provided, it uses that. Otherwise, it asks pgatour.com's website settings which event it's currently featuring, the same way pgatour.com's home page decides what to show. If it still can't find one, it stops and suggests re-running with a tournament ID.

### Step 3: Ask all three questions at once — lines [232–241](../pga-setup.js#L232-L241)

It asks pgatour.com for the field, tee times, and odds **at the same time** (rather than one after another, which would be slower), then prints the tournament's name.

### Step 4: Bow out if this week won't work — lines [242–263](../pga-setup.js#L242-L263)

There are four situations where the script politely stops without changing anything:

| Situation | Lines | Why |
| --- | --- | --- |
| **It's a team event** (like the Zurich Classic, or any "golfer" with a "/" in the name) | [242–248](../pga-setup.js#L242-L248) | The league's format is one golfer per pick, so team events are set up by hand with the Admin paste box. |
| **Odds aren't posted yet** | [249–252](../pga-setup.js#L249-L252) | Nothing to save yet. The next scheduled run will try again. |
| **The first group has already teed off** | [253–259](../pga-setup.js#L253-L259) | **The key safety rule.** Odds are locked once play starts, so the script won't touch the tournament. |
| **No golfer has both odds and a tee time** | [260–263](../pga-setup.js#L260-L263) | Nothing useful to save yet. |

### Step 5: Work out the time zone and date — lines [264–269](../pga-setup.js#L264-L269)

It picks the course time zone (falling back to Eastern if it doesn't recognize it, with a note in the log), then works out the date of Round 1 from the earliest tee time.

### Step 6: Connect to the database and decide the event type — lines [270–276](../pga-setup.js#L270-L276)

It signs in to the league's database as an administrator, loads this year's season schedule, and runs `typeFor` from Part 4 to pick regular, signature, or major.

### Step 7: Build the tournament record — lines [277–288](../pga-setup.js#L277-L288)

It creates the tournament's ID from its name and date (for example, `the_masters_2026-04-09`) and checks whether that tournament was already saved by an earlier run. Then it assembles the record: name, type, date, time zone, golfer list, and tee times.

Two careful touches here:
- **The event type is kept from the existing record.** If the commissioner already fixed the type on the Admin tab (say, changing "regular" to "signature"), later runs won't undo it.
- **Existing results are kept**, so nothing already recorded is wiped out.

### Step 8: Print a summary — lines [289–306](../pga-setup.js#L289-L306)

It writes a readable report to the log, for example:

> Tournament doc: the_masters_2026-04-09 | type major (name looks like a major) | Thursday 2026-04-09 | 91 golfers

…followed by up to 12 names of golfers skipped for missing odds or tee times, and a sample of the first 5 golfers with their odds and tee times. This is what you'd read in the GitHub Actions log to check a run.

### Step 9: Stop if nothing changed — lines [307–315](../pga-setup.js#L307-L315)

It compares the new golfer list with what's already saved (using `diffEntries` from `notify.js`). If there's no difference at all, it prints "No changes since the last run. Nothing written, no email." and stops. **This is what prevents people from getting the same email four times a week.**

If something did change, it logs a count: how many odds moved, golfers added, golfers removed, and tee times changed.

### Step 10: Save, then email — lines [316–321](../pga-setup.js#L316-L321)

- In **dry-run mode**, it says "nothing written" and saves nothing.
- Otherwise it **saves** the tournament to the database. The website, which is subscribed to the database, shows the new field within seconds.
- Finally it calls **`notifyOdds`** to send the email (in dry-run mode, this just prints a sample email instead of sending).

---

## Part 7: The email step (`notify.js`)

The email work lives in a separate file, [`notify.js`](../notify.js), but it's an essential part of this script, so here's a summary of the three pieces `pga-setup.js` borrows:

- **`diffEntries`** — compares the old and new golfer lists and reports what changed: odds that moved, golfers added, golfers removed, and tee times changed. The order of the list doesn't matter, only the contents.
- **`compose`** — writes the email for one person:
  - **First email of the week:** "⛳ Odds are up for [tournament]. Make your pick!" It lists how many golfers there are and the top 5 favorites.
  - **Later emails:** "⛳ Odds updated for [tournament]." It lists which odds moved (e.g. "+5000 → +4500"), who was added or removed, and whether tee times changed. Long lists are cut off at 15 with "...and N more."
  - Both end with when the first group tees off and a reminder that picks lock when your golfer tees off, plus a link to the site if one is set up.
- **`notifyOdds`** — sends the email to **everyone who has signed up** for the league. It remembers (in the database, under `notifications`) whether the "odds are up" email has already gone out for this tournament, which is how it knows whether to send the "posted" version or the "updated" version.

A few safety features in the email step:
- **If email isn't set up** (the mail-server settings `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` are missing), it skips emailing without breaking anything.
- **One failed email doesn't stop the others.** If some fail, it reports how many went out and marks the GitHub run as failed (a red ❌) so you notice.

---

## The safe ways to run it, side by side

| Mode | How to turn it on | Contacts pgatour.com? | Reads the database? | Saves anything? | Sends email? |
| --- | --- | --- | --- | --- | --- |
| **Self-test** | `SELFTEST=1` | ❌ | ❌ | ❌ | ❌ (prints samples) |
| **Dry run** | `DRY=1`, or "Dry run" in the Actions tab (checked by default) | ✅ | ✅ | ❌ | ❌ (prints a sample) |
| **Normal** | Neither (how the Tue/Wed schedule runs) | ✅ | ✅ | ✅ (only if something changed) | ✅ (only if something changed) |

---

## Quick reference: "Where do I change…?"

| I want to change… | Look here |
| --- | --- |
| Which days and times it runs | [`.github/workflows/pga-setup.yml`](../.github/workflows/pga-setup.yml), the `cron` line |
| Which golfers are skipped (withdrawn, alternates, no odds, no tee time) | `build`, lines [108–123](../pga-setup.js#L108-L123) |
| How the event type is chosen | `typeFor`, lines [134–155](../pga-setup.js#L134-L155) |
| Which names count as majors | Line [147](../pga-setup.js#L147) |
| The supported time zones | `ABBR` and `APP_TZ`, lines [42–60](../pga-setup.js#L42-L60) (and the `TZ` list in `index.html`) |
| Which events count as team events | Lines [242–248](../pga-setup.js#L242-L248) |
| The "don't change after tee-off" rule | Lines [253–259](../pga-setup.js#L253-L259) |
| Email wording | `compose` in [`notify.js`](../notify.js#L47-L111) |
| How golfer IDs are made | `keyOf`, lines [28–32](../pga-setup.js#L28-L32) (**must match `index.html`**) |

---

## Mini glossary

| Term | Meaning |
| --- | --- |
| **Field** | The list of golfers entered in a tournament. |
| **Alternate** | A golfer on standby who only plays if someone withdraws. |
| **Tee time** | When a golfer (or group) starts their round. |
| **Script** | A program that runs, does a job, and stops. It has no screen. |
| **GitHub Action / workflow** | An automated task GitHub runs on a schedule or on request. |
| **Cron** | A compact way of writing a schedule, like "Tue and Wed at 7:07 AM and 6:07 PM." |
| **Environment variable** | A setting handed to a script when it starts, like `DRY=1`. |
| **Secret** | A setting stored privately in GitHub so it never appears in the code. |
| **GraphQL** | A style of data service where you ask a specific question and get back just that answer. |
| **Compressed / gzip** | Data squeezed down to save space, like a .zip file. It has to be unpacked before use. |
| **Firestore** | The league's online database, run by Google's Firebase. |
| **SMTP** | The standard way computers send email. The SMTP settings tell the script which email account to send from. |
| **Dry run** | A practice run that shows what would happen without changing anything. |
| **Self-test** | A practice run with made-up data, to check the code still works. |
