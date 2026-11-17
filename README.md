# ⛳ Green Jackets Pick'em League

A no-fuss PGA Tour pick'em site for golf fans, friends, and the group chat that never shuts up about who's winning this week.

Every tournament, you pick **one golfer**. If your longshot goes low on Sunday, you get bragging rights *and* a lot of points. If your pick misses the cut, well... there's always next week.

<!-- 📸 Swap in a real screenshot: save it as docs/screenshots/picks.png and uncomment the line below -->
<!-- ![The Picks tab during a live tournament](docs/screenshots/picks.png) -->

---

## 🏌️ How it works

1. **Sign in** with Google or an email and password.
2. **Pick a golfer** from this week's field. Each golfer can only be taken by one person per tournament, so whoever picks first gets them.
3. **Change your mind** as often as you want until your golfer tees off. Once they're on the course, your pick is locked in. 🔒
4. **Watch the leaderboard** update live all weekend (scores, holes played, and position).
5. **Check the standings** to see who's up for the season, with a chart of everyone's points over time.

### 🧮 Scoring

Points reward people who take a chance on a longshot:

```
points = (odds ÷ finishing position ÷ 100) × event multiplier
```

| Event type   | Multiplier |
| ------------ | ---------- |
| Regular      | 1×         |
| Signature    | 1.25×      |
| Major 🏆     | 2×         |

So a **+5000** longshot who finishes **5th** at a regular event earns `5000 ÷ 5 ÷ 100 = 10.00` points. If they do that at a major, it's **20.00**. Tied golfers share the better position (a T3 counts as 3rd), and a missed cut or withdrawal is worth **0**.

---

## 🖼️ A quick look

<!-- Add screenshots to docs/screenshots/ and uncomment as you go -->

| Picks | Standings | Schedule |
| :---: | :-------: | :------: |
| <!-- ![Picks](docs/screenshots/picks.png) --> *screenshot coming soon* | <!-- ![Standings](docs/screenshots/standings.png) --> *screenshot coming soon* | <!-- ![Schedule](docs/screenshots/schedule.png) --> *screenshot coming soon* |

- **Picks**: this week's field with odds and tee times, plus everyone's picks and live scores.
- **Schedule**: the season's events, each marked as regular, signature, or major.
- **Standings**: the season leaderboard and a points-over-time chart.
- **Admin** (commissioner only): set up tournaments, import the schedule, update results, and clear picks if someone needs a do-over.

---

## 🤖 What runs behind the scenes

The site is one static page, and two GitHub Actions do the boring work so the commissioner doesn't have to.

| Workflow | When it runs | What it does |
| -------- | ------------ | ------------ |
| **Weekly field and odds** ([`pga-setup.js`](pga-setup.js)) | Tue & Wed, twice a day | Gets this week's field, Round 1 tee times, and odds from pgatour.com and saves them to Firestore. It won't write anything once the first group has teed off, so the odds stay put. |
| **Sync ESPN leaderboard** ([`sync.js`](sync.js)) | Every 5 min, Thu–Sun | Copies the live ESPN leaderboard (scores, holes played, positions, cuts) into Firestore so everyone's points update live. |

Both workflows can also be started by hand from the **Actions** tab, and they include dry-run and preview options so you can see what would change before anything is saved.

---

## 🧰 Tech stack

- **Frontend:** one [`index.html`](index.html) with plain JavaScript. No framework and no build step.
- **Auth & data:** Firebase Authentication and Cloud Firestore.
- **Automation:** GitHub Actions running Node 20 with `firebase-admin`.
- **Data sources:** pgatour.com (field, tee times, odds) and ESPN's public scoreboard feed (live scores).

```
pickem-site/
├── index.html          # the whole app: picks, schedule, standings, admin
├── sync.js             # ESPN → Firestore live leaderboard sync
├── pga-setup.js        # pgatour.com → Firestore weekly field + odds
├── package.json        # just firebase-admin
└── .github/workflows/
    ├── sync.yml        # runs sync.js during tournament play
    └── pga-setup.yml   # runs pga-setup.js early in the week
```

---

## 🚀 Running your own league

Want to start one with your own crew? Here's how to set it up:

1. **Create a Firebase project.** Turn on Authentication (Google + Email/Password) and Firestore.
2. **Update the config.** In `index.html`, paste your Firebase config and set the admin email (look for the `PASTE YOUR FIREBASE CONFIG HERE` comment). The admin email needs to match your Firestore security rules.
3. **Host it.** Because it's a single static file, GitHub Pages, Firebase Hosting, or any other static host will work.
4. **Add the repo secrets** under *Settings → Secrets and variables → Actions*:
   - `FIREBASE_SERVICE_ACCOUNT`: the JSON key for a Firebase service account
   - `PGA_API_KEY`: the public pgatour.com site key (used by the weekly setup)
5. **Try a dry run.** Start both workflows by hand with the preview/dry options to make sure everything connects, then let the schedules take over.

To test a script locally:

```bash
npm install
PREVIEW=1 node sync.js        # print what ESPN returns, nothing is written
SELFTEST=1 node pga-setup.js  # use fake data, no network needed
```

---

## 🙌 A friendly note

This is a just-for-fun side project for a group of friends. It isn't affiliated with the PGA TOUR, ESPN, Augusta National, or any sportsbook, and no real money is involved. Hit 'em straight! ⛳🍻
