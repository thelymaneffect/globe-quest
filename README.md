# Lyman Learning: World Domination Geography Game

A free browser game for kids and families. Pick a country (or US state), spin the battle wheel, and conquer the map — while learning capitals, languages, flags, greetings and fun facts.

No accounts, no ads, no tracking. Progress saves automatically in the player's own browser.

## How to play
1. Choose **World Mode** (199 countries) or **USA Mode** (50 states).
2. Tap the place you want to be, then pick your empire color.
3. Tap **any** place on the map to see its card, then press **Challenge**.
4. The battle wheel starts at 1/2 for you and 1/2 for them.
5. **Brain Boost** (optional): pick any topics: **Capitals**, **Famous Landmarks** and **Geography**. Both questions are about the place you are battling, and every answer is on its card. Right answers raise your chance (50% → 75% → 87.5%); wrong answers raise theirs. The fractions are shown too (1/2, 3/4, 7/8) for extra math practice.
6. Spin! Land on your color and you take their whole empire. Land on theirs and nothing is lost: study the card and try again (redemption). Each comeback attempt starts the wheel bigger (50% → 62.5% → 75%), because failing is a chance to learn and grow.
7. Own the whole map to win.

Zoom in to see capitals ★, major cities ●, rivers, lakes, mountain ranges and deserts. Switch between the **2D map** and the **3D globe** at any time.

## Install it as an app
On the title screen, a **📲 Get the app** button appears in the corner on phones, tablets and computers that support it (Chrome, Edge, Android, iPhone/iPad Safari, Mac Safari). Installed, it opens full-screen from the home screen and works offline.

**Airplane mode:** the app saves every file it needs (maps, facts, flags, fonts) on the device. When the title screen shows **✈️ Ready for airplane mode**, it plays with no internet at all. Only sending a game request and donating need the internet.

When you update the game later, change `VERSION` in `tools/make-offline-list.cjs` (for example to `lyman-wd-v3`) and run `node tools/make-offline-list.cjs`, so installed copies download the new files.

## Run it on your computer
Double-click `index.html` — it works offline in any modern browser.

## Put it online for free (GitHub Pages)
1. Create a new **public** repository on GitHub (for example `world-domination`).
2. Upload everything in this folder to it (drag and drop on the GitHub website works).
3. In the repository, go to **Settings → Pages**, set **Source** to “Deploy from a branch”, branch `main`, folder `/ (root)`, and save.
4. After a minute or two the game is live at `https://<your-username>.github.io/world-domination/`.

GitHub has no limit on the number of public repositories, and each one can have its own free Pages site.

## Project layout
- `index.html`, `css/`, `js/`: the game
- `data/`: maps, cities, rivers, mountains, plus the fact cards (`info-*.js`) famous places & traditions (`extras.js`) and animals & land types (`nature.js`), which are easy to edit
- `js/config.js`: put your PayPal or Square link here to show the **Support Lyman Learning** button
- `flags/`: country flags; `flags/us/`: state flags
- `vendor/`: D3 and TopoJSON libraries

## Credits
- Map shapes: [Natural Earth](https://www.naturalearthdata.com/) (public domain), via `world-atlas` and `us-atlas` (ISC)
- Cities, rivers, lakes, mountains and deserts: Natural Earth (public domain)
- Country flags: [flag-icons](https://github.com/lipis/flag-icons) (MIT)
- State flags: Wikimedia Commons (public domain)
- Libraries: [D3](https://d3js.org/) and [TopoJSON](https://github.com/topojson/topojson-client) (ISC)
- Country basics (names, areas): [mledoze/countries](https://github.com/mledoze/countries) (ODbL)
- Facts written for Lyman Learning; please report any mistakes.
