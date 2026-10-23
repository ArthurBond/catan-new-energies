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
   yourself: it is what makes you the host.
3. The server window lists the addresses friends can use, for example
   `http://192.168.1.105:3210`. Ignore addresses marked as virtual (WSL, Hyper-V).
4. In the lobby choose who sits where: you, a friend, or a bot for each seat. Send friends the
   join link shown in the lobby.
5. Friends open the link, type their name and pick a seat. Start the game when everyone is
   seated.
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
- **Start a fresh game.** Use New game in the host lobby. To wipe everything, stop the server
  and delete the `saves` folder.
