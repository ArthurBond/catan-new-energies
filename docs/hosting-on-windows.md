# Hosting a game for friends on your Windows PC

The game runs on a small server on your PC. Friends play in a browser on their own laptops.
The game only exists while your server is running, so nobody can play without you.

## One-time setup

1. Install Node.js 20 or newer (`node --version` to check).
2. In the project folder run `npm install`.
3. Allow friends through Windows Firewall. Open PowerShell **as administrator** in the project
   folder and run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\windows\allow-firewall.ps1
   ```

   This adds one inbound rule, "Catan New Energies (port 3210)", for private networks only.
   Remove it later with `-Remove`.
4. Make sure your Wi-Fi is a **Private** network: Settings > Network & internet > Wi-Fi >
   (your network) > Network profile type > Private. On a Public network the rule does not apply
   and friends cannot connect.

## Each game night

1. Double-click `scripts\windows\host-game.cmd` (or run `npm run host`).
   The first start takes a few seconds because it builds the game.
2. Your browser opens the host page (`http://localhost:3210/?host=...`). Keep that link to
   yourself: it is what makes you the host. The page remembers you as the host and removes the
   key from the address bar, so reloading or reopening `http://localhost:3210` on this PC still
   gives you the host controls.
3. The server window lists the addresses friends can use, for example
   `http://192.168.1.105:3210`. Ignore addresses marked as virtual (WSL, Hyper-V).
4. In the host lobby choose who sits where with the Host / Friend / Bot buttons on each seat
   (you are the Host seat). Bots get a style and a level. Pick 3 or 4 players, the island and
   how starting pieces are placed. Press **Copy link** in "Invite friends" and send that link
   to your friends. It never contains your host key.
5. Friends open the link, type their name and press **Take this seat** on an open seat. You
   see each friend appear on their seat. **Start game** unlocks when every Friend seat is
   taken. Each player only ever sees their own cards: the others show just a card count.
   Someone who opens the link after the game started can take a free seat or just watch.
6. To stop, close the server window (or press Ctrl+C). The game is saved after every move, so
   starting the server again carries on where you left off. If a friend's laptop drops off
   Wi-Fi or they reload the page, they go straight back to their seat.

## Friends who are not on your Wi-Fi

Pick one of these. Your PC still runs the game, so it still only works while you are hosting.

- **Tailscale (recommended).** Free and private, with no router changes. Install Tailscale on
  your PC and on each friend's laptop, and share your PC with them from the Tailscale admin
  console. Friends then open `http://<your-pc-name>:3210` (or the 100.x.y.z address Tailscale
  shows). If Windows lists the Tailscale network as Public, make it Private (admin PowerShell:
  `Set-NetConnectionProfile -InterfaceAlias Tailscale -NetworkCategory Private`) so the firewall
  rule applies to it.
- **Cloudflare quick tunnel.** Install `cloudflared`, then while the server runs:
  `cloudflared tunnel --url http://localhost:3210`. It prints a public `https://….trycloudflare.com`
  link to send to friends. The link changes every time, and anyone who has it can open the page
  and take an empty seat, so only send it to your friends.
- **Router port forwarding** (last resort). Forward TCP 3210 to your PC's LAN address and give
  friends your public IP. This opens your PC to the internet while the server runs. Prefer one
  of the options above.

## Troubleshooting

- **Friends get "can't reach this page".** Check the Wi-Fi is Private, the firewall script ran,
  and you are on the same network. Try opening the address yourself from your phone.
- **Port already in use.** Start on another port: `set PORT=3300 && npm run host` in Command
  Prompt (and rerun the firewall script with `-Port 3300`).
- **"Open in another window".** A seat can only be played in one window. Press **Use this
  window** on the screen that says so to take the seat back.
- **Start a fresh game.** Press **New game** in the top bar during a game (only you have it;
  it asks first and sends everyone back to the lobby with the seats kept). To wipe everything,
  stop the server and delete the `saves` folder.
