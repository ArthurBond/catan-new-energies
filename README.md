# New Energies — a Catan game in the browser

A web version of the board game *Catan: New Energies*: build towns, cities and power plants,
balance clean and fossil energy, and keep the island's footprint down before events hit.

**Play it:** https://arthurbond.github.io/catan-new-energies/

- 3 or 4 players: play against bots (three styles, three levels) or pass-and-play on one device.
- First Game board or a random island; place your starting town and city yourself or use the
  fixed setup.
- Full rules engine: events and the global footprint, hazards and the Inspector, power plants,
  harbors, player trades, development cards, and both ways to win.
- Your game is saved in the browser, so you can close the tab and carry on later.

## Run it locally

Needs Node.js 22 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm test           # unit tests (Vitest)
npm run test:e2e   # browser tests (Playwright, uses Chrome)
npm run typecheck
npm run lint
```

## Play with friends on your network

The GitHub Pages site plays offline (bots and pass-and-play). For online play, one person hosts
a small server on their own computer and friends join from their browsers:

```bash
npm run host       # builds the game and starts the server on port 3210
```

The server window lists the addresses friends can open (for example `http://192.168.1.105:3210`).
On Windows, `scripts\windows\allow-firewall.ps1` (run as administrator) lets them through the
firewall, and `scripts\windows\host-game.cmd` starts the server with a double-click.

## Publishing updates

To publish your latest committed work:

```bash
npm run publish:pages
```

This builds the site and pushes it to the `gh-pages` branch, which GitHub Pages serves, and
pushes the source to `main`.

## Credits

A fan-made project, not affiliated with or endorsed by CATAN GmbH or KOSMOS. CATAN and
Catan: New Energies are trademarks of their respective owners. All artwork in this project is
original vector illustration.
