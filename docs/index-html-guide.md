# A Plain-English Tour of `index.html`

This guide walks through [`index.html`](../index.html), the single file that *is* the Green Jackets Pick'em website. It's written for someone who has never coded. You don't need to understand every symbol. The goal is that you can open the file, find a section, and know roughly what it does and why it's there.

Line numbers are included so you can jump straight to each part. (They're accurate as of November 2026. If the file changes a lot, they may drift a little, but the section names will still help you find your way.)

---

## The big picture

Think of the file as a restaurant with three areas:

| Area | Lines | Restaurant comparison | What it does |
| --- | --- | --- | --- |
| **HTML** (the structure) | 1–6, 313–316, 1386–1389 | The building itself | Tells the web browser "this is a web page" and gives it an empty spot to fill in. |
| **CSS** (the style) | 7–312 | The decor and paint | Colors, fonts, spacing, how buttons and tables look. |
| **JavaScript** (the behavior) | 316–1387 | The kitchen and staff | Signs people in, loads picks, does the scoring math, and draws every screen you see. |

One unusual thing about this site: the page starts out almost **completely empty**. There's only one blank box (`<div id="app">`). Everything you see — the header, the tabs, the tables, the chart — is built by JavaScript and poured into that box. Every time something changes (someone makes a pick, a score updates), the JavaScript rebuilds the screen from scratch. That "rebuild" step is called **rendering**, and you'll see the word `render` all over the file.

---

## Part 1: The page skeleton

**Lines [1–6](../index.html#L1-L6), [313–316](../index.html#L313-L316), and [1386–1389](../index.html#L1386-L1389)**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Green Jackets Pick’em League</title>
```

- `<!doctype html>` and `<html lang="en">` announce "this is a modern web page in English."
- `<head>` holds behind-the-scenes info that isn't shown on the page itself.
- `charset="utf-8"` lets the page show special characters like curly apostrophes, ▲ arrows, and emoji.
- The `viewport` line is what makes the site fit nicely on a phone instead of looking like a tiny shrunken desktop page.
- `<title>` is the text you see on the browser tab.

Further down:

```html
<body>
  <div id="app"></div>
  <script type="module">
```

- `<body>` is the visible part of the page.
- `<div id="app"></div>` is the empty box mentioned above. Everything gets drawn inside it.
- `<script>` marks where the JavaScript begins. The file ends by closing these tags (`</script></body></html>`).

---

## Part 2: The look and feel (CSS)

**Lines [7–312](../index.html#L7-L312)**, everything between `<style>` and `</style>`.

CSS is a list of rules that say "things of *this* kind should look like *this*." Each rule has a name (called a *selector*) followed by settings in curly braces. For example:

```css
.pill {
  font-size: 12px;
  border-radius: 99px;
  background: #e5efe9;
}
```

…means "anything labeled `pill` should have small text, fully rounded ends, and a light green background." Those little "Your pick" / "Locked in" badges are pills.

Colors are written as **hex codes** like `#0b3d2c`. You can paste one into Google ("#0b3d2c color") to see what it is.

Here's how the style rules group together:

### The color palette — lines [8–18](../index.html#L8-L18)

```css
:root {
  --g: #0b3d2c;     /* deep Augusta green */
  --pink: #d9467c;  /* azalea pink accent */
  --cream: #f7f4ea; /* page background */
  ...
}
```

This is the **master color list**. Each color gets a nickname (`--g` for green, `--pink`, `--cream`, `--bad` for error red, `--mut` for muted gray text, and so on). The rest of the file says things like `var(--g)` instead of repeating the hex code. **This is the easiest place to re-theme the whole site:** change a color here and it changes everywhere.

### Page basics — lines [19–36](../index.html#L19-L36)

Sets the page background to cream, the default text color, and the fonts. Regular text uses the device's built-in system font; headings (`h1`, `h2`, `h3`) use Georgia, a classic serif font that gives it a Masters-style feel.

### Header and tabs — lines [37–76](../index.html#L37-L76)

The dark green bar across the top with the league name, your name, the "Sign out" link, and the row of tabs (Picks, Schedule, Standings, Admin). The rule `nav button.on` is what puts the **pink underline** under whichever tab you're on.

### Main content area and cards — lines [77–124](../index.html#L77-L124)

- `main` keeps the content centered and no wider than 640 pixels, so it reads well on big screens.
- `.card` is the white rounded box that most content sits in.
- `.row` is a single line inside a card (used in the standings list and admin screens).
- `.mut` makes text smaller and gray, for less-important details.
- `.row.mine` gives a light pink highlight.

### Buttons and form fields — lines [125–176](../index.html#L125-L176)

The default button is solid green with white text. Variations:
- `ghost` — outlined, no fill (e.g., "Continue with Google")
- `sm` — smaller
- `pink` — the pink "Submit pick" button
- `:disabled` — fades a button out when you can't click it yet

Then there are the text boxes, dropdowns, and big paste boxes (`textarea`) used on the sign-in and Admin screens. `.err` makes error messages red.

### Small extras — lines [177–231](../index.html#L177-L231)

- `.sticky` keeps the **search bar and Submit button pinned to the top** of the screen while you scroll through the golfer list.
- `.lnk` styles clickable green links.
- `.ok` is for green success messages ("Saved 156 entries…").
- `.rank` and `.pts` are the big serif numbers in the standings.
- `.pill` is the rounded badge; `.pill.x` is a red version.
- `.login` centers and narrows the sign-in form.

### Tables — lines [232–263](../index.html#L232-L263) and [284–311](../index.html#L284-L311)

Rules for the picks table, golfer list, and schedule. Highlights:
- `td.th` — column headers you can click to sort.
- `td.n` — right-aligns number columns so the digits line up.
- `tr.me` — **light green highlight on your own row**.
- `tr.sel` — **pink highlight on the golfer you've selected** but not submitted.
- `tr.off` — fades out golfers who are taken or already on the course.
- `.lg` — the color-dot legend under the season chart.

### The pop-up window — lines [264–283](../index.html#L264-L283)

- `.ov` (overlay) is the dark see-through layer that covers the page.
- `.panel` is the white box on top of it.

This is what appears when you click a tournament name on the Schedule tab.

---

## Part 3: The behavior (JavaScript)

Everything from line 316 to 1387. This is the bulk of the file, so it's broken into chapters below.

A few terms you'll see repeatedly:

- **Function** — a named set of instructions, like a recipe. `function pts(...)` is the "how to calculate points" recipe. Other parts of the code "call" it whenever they need points calculated.
- **Variable** — a labeled container that holds a value, created with `const` or `let`.
- **Firestore** — the online database (run by Google's Firebase) where all tournaments, picks, and users are stored.
- `//` and `/* ... */` — **comments**. Notes for humans; the computer ignores them.

### 3.1 Borrowing tools from Firebase — lines [317–336](../index.html#L317-L336)

```js
import { initializeApp } from "https://www.gstatic.com/firebasejs/...";
import { getAuth, signInWithEmailAndPassword, ... } from ".../firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, ... } from ".../firebase-firestore.js";
```

Rather than writing sign-in and database code from scratch, the site borrows ready-made tools from Google's Firebase. These three `import` lines are like checking tools out of a library:

- **firebase-app** — the basic connection to Firebase.
- **firebase-auth** — signing in (email/password or Google), creating accounts, signing out.
- **firebase-firestore** — reading and saving data in the database. The most important one is `onSnapshot`, which means "keep me updated live whenever this data changes."

### 3.2 Site settings — lines [338–352](../index.html#L338-L352)

```js
const firebaseConfig = { apiKey: "...", projectId: "green-jackets-pickem-league", ... };
const ADMIN_EMAIL = "...";
```

- **`firebaseConfig`** is the "address" of this league's Firebase project. It tells the page *which* database to talk to. (Despite the name `apiKey`, this isn't a secret password — Firebase expects it to be visible in the page. The real protection comes from the security rules in [`firestore.rules`](../firestore.rules).)
- **`ADMIN_EMAIL`** is the commissioner. Whoever signs in with this email sees the Admin tab. It must match the email in `firestore.rules`, which is what actually enforces admin-only actions on the database side.

Lines [350–352](../index.html#L350-L352) then open the connection using those settings: `app` (Firebase), `auth` (sign-in), and `db` (database).

### 3.3 League rules and lookup lists — lines [353–360](../index.html#L353-L360)

```js
const MULT = { regular: 1, signature: 1.25, major: 2 };
```

The **point multipliers** for each type of event. If the league ever wants majors to count triple, this is the line to change.

```js
const TZ = { Eastern: "America/New_York", Central: "America/Chicago", ... };
```

The list of time zones offered in the Admin "Course time zone" dropdown, so tee times display correctly no matter where the course is.

### 3.4 The app's memory — lines [361–389](../index.html#L361-L389)

```js
const S = {
  user: null,
  tours: [],
  picks: [],
  users: [],
  tab: "picks",
  draft: null,
  ...
};
```

`S` (short for "state") is the site's **short-term memory** — a single container holding everything the page currently knows. The important pieces:

| Item | What it remembers |
| --- | --- |
| `user` | Who is signed in (or nobody). |
| `tours` | All tournaments loaded from the database. |
| `picks` | Everyone's picks. |
| `users` | Everyone in the league. |
| `sched` | The season schedule. |
| `tab` | Which tab you're looking at. |
| `cur` | Which tournament is chosen in the dropdown. |
| `draft` | The golfer you've clicked "Select" on but haven't submitted yet. |
| `q` | What you've typed in the search box. |
| `ps` / `fs` | How the picks table / golfer list are currently sorted. |
| `modal` | Which tournament pop-up is open, if any. |
| `now` | The current time (refreshed every 30 seconds). |
| `msg` / `err` | The current success message or error message to show. |
| `adm`, `sp`, `parsed` | Whatever the commissioner is typing or previewing on the Admin tab. |
| `mode` | Whether the sign-in screen is in "Sign in" or "Create account" mode. |

When anything changes, the code updates `S` and then redraws the screen from it.

### 3.5 Little helper tools — lines [390–408](../index.html#L390-L408)

Small, single-purpose shortcuts used everywhere:

- **`$`** — "find this element on the page" (e.g., find the email box).
- **`esc`** — a safety tool. Before any name typed by a user is shown on the page, it's cleaned so that someone can't sneak harmful code in through their display name.
- **`keyOf`** — turns a name into a simple ID. "Scottie Scheffler" becomes `scottie_scheffler`.
- **`isAdmin`** — answers "is the signed-in person the commissioner?"
- **`fmtOdds`** — formats odds for display, adding a `+` (so `5000` shows as `+5000`) or a dash if there are no odds.
- **`tourTime`** — shows a tee time like "8:42 AM" in the course's local time zone.

### 3.6 Reading the pasted golfer field — lines [410–449](../index.html#L410-L449)

These two functions support the Admin "New tournament" screen, where the commissioner can paste in a table copied from the PGA Tour website.

- **`zonedMs`** converts something like "8:42 AM on April 10 in Eastern time" into an exact moment in time that every computer agrees on. Time zones and daylight saving make this surprisingly fiddly, which is why it looks complicated. You can treat it as a black box.
- **`parseField`** goes through the pasted table line by line. For each line it finds the golfer's **name**, their **tee time** (anything that looks like `8:42 AM`), and their **odds** (a number like `+5000`). It builds a clean list of golfers from that.

> Note: Normally the weekly field and odds are filled in automatically by [`pga-setup.js`](../pga-setup.js). This paste feature is the manual backup.

### 3.7 The scoring formula — lines [450–459](../index.html#L450-L459)

```js
function pts(t, p) {
  ...
  return r > 0 && e.odds ? (e.odds / r / 100) * (MULT[t.type] || 1) : 0;
}
```

**This is the heart of the league.** In plain English:

> Points = the golfer's odds ÷ their finishing position ÷ 100 × the event multiplier.
> If the golfer missed the cut or withdrew, points = 0.

So a +5000 golfer who finishes 5th at a regular event earns 5000 ÷ 5 ÷ 100 × 1 = **10.00** points.

- **`pos`** looks up a golfer's finishing position. (A position of `0` is how the code stores "missed cut / withdrew / disqualified.")
- **`fmtPts`** shows points with two decimal places, or a dash if there aren't any yet.

If you ever want to change how scoring works, **this is the one line to edit**.

### 3.8 Live connection to the database — lines [461–518](../index.html#L461-L518)

```js
function startData() {
  onSnapshot(collection(db, "tournaments"), ...);
  onSnapshot(collection(db, "users"), ...);
  onSnapshot(collection(db, "schedule"), ...);
  onSnapshot(collection(db, "picks"), ...);
}
```

This sets up four **live feeds** from the database. Instead of asking "anything new?" over and over, the page subscribes to each list and the database pushes changes to it instantly. That's why you see someone else's pick appear without refreshing.

The four feeds are:
1. **tournaments** — every event with its field, odds, tee times, and results. When these first load, it also automatically picks which tournament to show: the next upcoming one (or one that started in the last 4 days), otherwise the most recent.
2. **users** — everyone's display name.
3. **schedule** — the season calendar. It grabs this year's schedule, or the newest one available.
4. **picks** — every pick everyone has made.

After each update, it calls `render()` to redraw the screen. The `unsub` list keeps track of these feeds so they can be switched off when someone signs out.

### 3.9 Watching for sign-in, and the 30-second clock — lines [519–536](../index.html#L519-L536)

- **`onAuthStateChanged`** runs whenever someone signs in or out. When someone signs in, it:
  1. Turns off any old live feeds.
  2. Makes sure they have a record in the `users` list (using their Google name, or the start of their email).
  3. Starts the live feeds from 3.8.
  4. Redraws the screen.

  When someone signs out, it just clears everything and shows the sign-in screen.

- **`setInterval(..., 30000)`** is a timer that goes off every 30 seconds (30,000 milliseconds). It updates the clock in `S.now` and redraws. This is how golfers automatically become **locked** the moment they tee off, and how "updated 3 min ago" stays accurate, without anyone refreshing the page.

### 3.10 Actions: what happens when you click things — lines [538–827](../index.html#L538-L827)

```js
const A = (window.A = { tab(t) {...}, login() {...}, submit() {...}, ... });
```

`A` is a **collection of every action** a person can take. In the page, buttons say things like `onclick="A.submit()"`, meaning "when clicked, run the `submit` action." Here they are, grouped by purpose:

#### Getting around — lines [540–576](../index.html#L540-L576)

| Action | What it does |
| --- | --- |
| `tab` | Switch tabs (Picks, Schedule, Standings, Admin). |
| `cur` | Switch which tournament is shown in the dropdown. |
| `q` | Update the golfer search as you type. |
| `open` / `close` | Open or close the tournament pop-up on the Schedule tab. |
| `hs` | Sort a table when you click a column header. Click once to sort, again to reverse. (Points sort highest-first by default; everything else lowest-first.) |
| `mode` | Flip the sign-in screen between "Sign in" and "Create account." |

#### Signing in and out — lines [577–608](../index.html#L577-L608)

- **`login`** reads the email and password boxes. In "Create account" mode it makes a new account and saves the display name; otherwise it signs in. If something goes wrong (wrong password, etc.), it shows Firebase's error message in red.
- **`google`** opens the "Sign in with Google" pop-up.
- **`out`** signs you out.

#### Making a pick — lines [609–660](../index.html#L609-L660)

- **`select`** — clicking "Select" on a golfer highlights them in pink (stored in `S.draft`). Clicking again un-selects.
- **`submit`** — the "Submit pick" button. This is the most rule-heavy action. In order, it:
  1. Checks whether **your current pick has already teed off**. If so: "Your pick is locked in." No swapping once your golfer is on the course.
  2. Checks whether **the golfer you're switching to has already teed off**. If so, that's not allowed either.
  3. Saves the change as a single all-or-nothing bundle (a *batch*): removes your old pick if you had one, adds the new pick, and updates a small `userPicks` record that says "this person's golfer for this tournament is X." The database rules use that record to make sure nobody holds two picks at once.
  4. If the save fails — most likely because someone else grabbed that golfer a split second earlier — it shows a friendly error.
  5. On success, it scrolls you back to the top so you can see your pick in the table.

#### Clearing a pick (admin) — lines [661–668](../index.html#L661-L668)

- **`clear`** asks "Clear this pick?" and, if confirmed, deletes that pick (and its matching `userPicks` record). Used for do-overs.

#### Importing the season schedule (admin) — lines [669–717](../index.html#L669-L717)

- **`adm`** remembers what the commissioner types into the Admin form boxes.
- **`fromSched`** — choosing a tournament from "Start from the schedule" fills in the name, date, and event type automatically.
- **`spt`**, **`sparse`**, **`ssave`** — the three steps of the "Import season schedule" box: remember the pasted text, **preview** it (reading it with `parseSched`, described in 3.12), then **save** it to the database.

#### Setting up a tournament (admin) — lines [718–759](../index.html#L718-L759)

- **`parse`** — the "Preview" button. Makes sure a name, date, and pasted table were all provided, then uses `parseField` (3.6) to build the golfer list.
- **`odds`** — lets the commissioner type in any odds that were missing from the paste.
- **`save`** — refuses to save if any odds are still missing, then saves the tournament (name, type, date, time zone, every golfer with their odds and tee time). If the tournament already existed, it keeps any results that were already entered.

#### Updating the leaderboard by hand (admin) — lines [760–826](../index.html#L760-L826)

- **`results`** — the manual backup for live scoring (normally [`sync.js`](../sync.js) does this automatically every 5 minutes). The commissioner pastes the ESPN leaderboard, and this action:
  1. Finds the header row to figure out which column is the **score** and which is **thru** (holes played).
  2. For each golfer in the field, hunts for their line in the paste — first by full name, then by last name if needed.
  3. Reads the **position** from the first column: "T5" becomes 5, and "CUT", "MC", "WD", "DQ" become 0 (no points).
  4. Saves everything and reports how many golfers were updated and how many couldn't be found.

Right after the actions, line [828](../index.html#L828) defines **`curT`**, shorthand for "the tournament currently selected in the dropdown."

### 3.11 Views: building each screen — lines [830–1356](../index.html#L830-L1356)

A **view** is a function that builds the content for one screen (or one piece of a screen) as a chunk of HTML text. They read from `S` and produce what you see. None of them change any data; they just display it.

#### Sign-in screen — lines [831–841](../index.html#L831-L841)

**`loginView`** draws the league title, email and password boxes (plus a "Display name" box in Create-account mode), any error message, the "Sign in" and "Continue with Google" buttons, and the link to switch modes.

#### Tournament dropdown — lines [843–847](../index.html#L843-L847)

**`tourSelect`** builds the dropdown listing every tournament with its date. It's used on both the Picks and Admin tabs.

#### Sorting helpers — lines [849–875](../index.html#L849-L875)

Behind-the-scenes tools that make clickable, sortable columns work:
- **`lastN`** — pulls out a golfer's last name, so "Golfer" sorts by last name.
- **`scn`** — turns a golf score like "E" or "-7" into a number for sorting ("E" = 0).
- **`cmp`** — compares two values for sorting and always pushes blanks to the bottom.
- **`hd`** / **`heads`** — build the clickable column headers (Pick, Golfer, Odds, Score, Thru, Pos, Pts) and add a ▲ or ▼ arrow to the one being sorted.
- **`posv`** — decides where a golfer sorts in the "Pos" column: finishers by position, then missed cuts, then golfers who are on the course but don't have a position yet, then golfers who haven't teed off (in tee-time order).
- **`liveOf`** — gets a golfer's live score and holes played, showing a dash when there's nothing yet.

#### The Picks tab — lines [876–1018](../index.html#L876-L1018)

This tab is built from four pieces stacked on top of each other (see **`picksView`**, lines [942–947](../index.html#L942-L947)):

1. **The tournament dropdown** (above).
2. **"Leaderboard updated…" line** — **`updatedAt`**, lines [948–965](../index.html#L948-L965). Shows when scores were last refreshed, like "Leaderboard updated 2:14 PM (3 min ago)."
3. **The league picks table** — **`picksTable`**, lines [876–934](../index.html#L876-L934). One row per league member: their name, their golfer, odds, live score, holes played, position (or tee time if they haven't started), and points. If you haven't picked, your row says "Hasn't picked yet" as a link that scrolls you down to the golfer list. By default it sorts finished golfers by points, then golfers on the course, then golfers who haven't teed off, then people with no pick. Your row is highlighted green. It also shows the event type and multiplier under the title.
   - **`cutLabel`**, lines [936–941](../index.html#L936-L941), shows "Projected Cut: +2" (or "Cut: +2" once it's official) next to the tournament name, using data saved by `sync.js`.
4. **The golfer list** — **`golfers`**, lines [966–1018](../index.html#L966-L1018). The full field, filtered by whatever's in the search box. The first column changes depending on the situation:
   - **"Your pick"** pill (or **"Locked in"** once your golfer tees off),
   - **someone else's name** if another member took that golfer,
   - **a dash** if the golfer has teed off or your own pick is locked,
   - otherwise a **"Select"** button.

   It also builds the sticky search bar and decides whether **"Submit pick"** can be clicked (only when you've selected an available golfer who hasn't teed off, your current pick isn't locked, and it's not the golfer you already have).

If there are no tournaments yet, `picksView` shows a friendly placeholder message instead.

#### Schedule import helpers — lines [1019–1084](../index.html#L1019-L1084)

- **`toISO`** — accepts dates written in different styles ("2026-04-09", "4/9/26", "Apr 9 2026") and converts them to one standard format.
- **`parseSched`** — reads schedule rows pasted from Excel (Date Start, Date End, Tournament, Venue, Type). It sorts each event into major, signature, or regular based on the Type column, and keeps a list of rows it couldn't read.
- **`cap`**, **`fd`**, **`addDays`** — small formatting helpers: capitalize a word, show a date as "Apr 9", and add days to a date.
- **`overlap`** — counts how many words two tournament names share. Used to match schedule entries to tournaments even if the names are written slightly differently ("the Masters" vs "Masters Tournament").
- **`isOver`** — decides a tournament is finished once about 4½ days have passed since Round 1.

#### Per-tournament results helpers — lines [1085–1108](../index.html#L1085-L1108)

- **`tourRows`** — for a given tournament, lists each member with their pick, finishing position, and points.
- **`winnerOf`** — figures out who scored the most points in a tournament (handling ties by listing everyone tied). This fills the "Winner" column on the Schedule tab.

#### The Standings tab — lines [1109–1218](../index.html#L1109-L1218)

**`standView`** puts two cards together:

1. **Season standings** — **`boardHtml`**, lines [1205–1218](../index.html#L1205-L1218). Adds up every member's points across every tournament and lists them from highest to lowest, with your row highlighted.
2. **"Points over the season" chart** — **`chartCard`**, lines [1112–1142](../index.html#L1112-L1142), and **`lineChart`**, lines [1153–1204](../index.html#L1153-L1204).
   - `chartCard` works out each person's running total after each tournament and assigns colors.
   - **`COLORS`**, lines [1143–1152](../index.html#L1143-L1152), is the list of line colors. Colors are assigned in alphabetical order by name, so each person keeps the same color every time.
   - `lineChart` actually **draws the chart** as an SVG (a type of image made from shapes, drawn by the code rather than loaded from a file). It works out a neat scale for the side (like 0, 5, 10, 15), draws the faint gridlines, draws one line per person — **your line is drawn thicker and on top** — adds dots you can hover over to see exact numbers, and puts a color legend underneath, ordered by who's winning.

#### Tournament recap card — lines [1219–1226](../index.html#L1219-L1226)

**`cardHtml`** builds the recap for one tournament: each member, their golfer, odds, finishing position ("P5", "CUT/WD"), and points, highest first. This is the content of the pop-up on the Schedule tab.

#### The Schedule tab — lines [1227–1287](../index.html#L1227-L1287)

**`scheduleView`** builds the season calendar. The tricky part is that the **schedule** (the calendar of events) and the **tournaments** (events actually set up for picks) are stored separately, so it matches them up: same start date (within a day), and similar names. Then for each row it shows:
- start and end dates, venue, and event label,
- the tournament name — as a **clickable link** if picks exist for it (opens the recap pop-up),
- the **winner**, their golfer, and points once it's over, or "In progress" while it's being played.

Any tournaments that didn't match a schedule entry are added in too, so nothing gets lost.

#### The pop-up window — lines [1288–1298](../index.html#L1288-L1298)

- **`modalHtml`** wraps the tournament recap in the dark overlay with a "Close" button. Clicking outside the white box also closes it.
- The `keydown` listener lets you press **Esc** to close it.

#### The Admin tab — lines [1299–1356](../index.html#L1299-L1356)

**`adminView`** is only reachable by the commissioner. It builds four cards:

1. **New tournament** — an optional "Start from the schedule" dropdown (upcoming events only), plus name, type, Round 1 date, course time zone, and a big box to paste the PGA Tour table. After "Preview," a list of found golfers appears with their tee times and an editable odds box for each. Rows missing odds are highlighted pink.
2. **Update leaderboard** — a tournament dropdown and a box to paste the ESPN leaderboard.
3. **Import season schedule** — a paste box for the Excel rows, then a preview of every event with its type, and a "Save schedule" button.
4. **Clear a pick** — every pick for the selected tournament, each with a "Clear" button.

### 3.12 The rendering engine — lines [1358–1386](../index.html#L1358-L1386)

```js
function render(force, focus) { ... }
render(true);
```

**`render`** is the function that actually puts everything on screen. Every time it runs, it:

1. **Holds off if you're typing.** If your cursor is in a text box or dropdown, and this is just a background update (like the 30-second timer or someone else making a pick), it skips the redraw so it doesn't wipe out what you're typing. Redraws caused by your own clicks (marked `force`) always go through.
2. **Shows the sign-in screen** if nobody is signed in.
3. **Otherwise builds the full page:** the green header with the league name, your name, and "Sign out"; the row of tabs (Admin only appears for the commissioner); then the content for whichever tab is active; then the pop-up if one is open.
4. **Puts your cursor back in the search box** after a search-triggered redraw, so you can keep typing smoothly.

The very last line, `render(true);`, draws the page for the first time when it loads.

---

## Quick reference: "Where do I change…?"

| I want to change… | Look here |
| --- | --- |
| The site's colors | Color palette, lines [8–18](../index.html#L8-L18) |
| Fonts | Lines [26–35](../index.html#L26-L35) |
| The league name | `<title>` on line [6](../index.html#L6), the header on line [1377](../index.html#L1377), and the sign-in screen on line [833](../index.html#L833) |
| Who the commissioner is | `ADMIN_EMAIL`, line [348](../index.html#L348) (and also `firestore.rules`) |
| Event multipliers (e.g. majors = 3×) | `MULT`, line [353](../index.html#L353) |
| The scoring formula | `pts`, lines [453–458](../index.html#L453-L458) |
| Pick-locking rules | `submit`, lines [613–660](../index.html#L613-L660) (and also `firestore.rules`, which enforces them on the database side) |
| How often the page checks the clock | `setInterval`, lines [533–536](../index.html#L533-L536) |
| Chart line colors | `COLORS`, lines [1143–1152](../index.html#L1143-L1152) |
| The tab names or order | `render`, lines [1370–1375](../index.html#L1370-L1375) |
| Wording of error messages | Search the file for the message text (Ctrl+F) |

> **One important safety note:** the checks in this file (like "you can't pick a golfer who has teed off") make the site friendly, but they aren't the real lock. A clever person could get around anything that runs in their own browser. The rules that truly can't be bypassed live in [`firestore.rules`](../firestore.rules), which runs on Google's servers. If you change a rule here, change it there too.

---

## Mini glossary

| Term | Meaning |
| --- | --- |
| **HTML** | The structure of a web page. |
| **CSS** | The styling of a web page (colors, spacing, fonts). |
| **JavaScript** | The programming language that makes a page interactive. |
| **Function** | A named, reusable set of instructions. |
| **Variable** | A labeled container holding a value. |
| **State (`S`)** | Everything the page currently knows. |
| **Render** | Redraw the screen from the current state. |
| **Firebase / Firestore** | Google's service for sign-ins and the online database. |
| **Snapshot / live feed** | A subscription where the database pushes changes to the page instantly. |
| **Batch** | Several database changes saved together, all-or-nothing. |
| **SVG** | An image built from shapes by code (used for the chart). |
| **Modal / pop-up** | A box that appears on top of the page. |
| **Hex code** | A color written as `#` plus six characters, like `#0b3d2c`. |
