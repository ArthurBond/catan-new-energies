# Playing with friends and family, wherever they are

One person **hosts**: they run a small game server on their own computer. Everyone else opens a
link in a browser on a phone, tablet or laptop. Nothing is installed on the friends' side and
nothing is uploaded to a game company: the game lives on the host's computer.

There are three ways to host. Pick by where your friends are.

| Way to host | Who can join | What friends need | Start it with |
| --- | --- | --- | --- |
| **Online link** (recommended) | Anyone you send the link to, on any network | A browser | `npm run host:online` |
| **Private Tailscale network** | People who run Tailscale and whom you gave access | The Tailscale app | `npm run host:tailnet` |
| **Home Wi-Fi** | People on the same Wi-Fi as the host | A browser | `npm run host` |

All three are the same game and the same lobby. The online link and the private network are
encrypted by [Tailscale](https://tailscale.com), which is free for personal use.

---

## Online link: the quick way

### Set up once (host only, about ten minutes)

1. **Install Node.js 22 or newer** from <https://nodejs.org>, then in the game folder run:

   ```bash
   npm install
   ```

2. **Install Tailscale** on the host computer from <https://tailscale.com/download> and sign in
   (a free personal account is enough). Leave it connected.

3. **Start the game once:**

   ```bash
   npm run host:online
   ```

   The first time, Tailscale has to be told that this computer may share a public link. The
   server window prints a `https://login.tailscale.com/...` address and opens it in your
   browser. Sign in, press the button to turn on **HTTPS** and **Funnel**, and go back to the
   server window. The game carries on by itself and prints your invite link.

   If that page does not appear, or you manage your Tailscale settings by hand, do the same thing
   in the [Tailscale admin console](https://login.tailscale.com/admin):

   - **DNS** page: turn on **MagicDNS**, then under **HTTPS Certificates** choose **Enable HTTPS**.
   - **Access controls** page: add this to the policy file, next to the other top-level entries:

     ```json
     "nodeAttrs": [
       { "target": ["autogroup:member"], "attr": ["funnel"] }
     ]
     ```

   A brand-new link can take a few minutes (up to ten) before it works everywhere. This only
   happens the first time.

### Every game night

1. Start the server:

   ```bash
   npm run host:online
   ```

   On a Mac you can double-click `scripts/mac/host-online.command` instead; on Windows,
   `scripts\windows\host-online.cmd`.

2. Your browser opens the **host lobby**. Under **Invite friends** is the invite link. Press
   **Copy link** and send it to your friends in a message. The same link is printed in the server
   window:

   ```text
   INVITE LINK. Send this to your friends:

       https://your-computer.your-tailnet.ts.net/?join=ABCD-EFGH
   ```

3. Choose who sits where (Host, Friend or Bot), wait for your friends to take their seats, and
   press **Start game**.

   To play again, anyone at the table presses **New game** in the top bar (or on the final
   standings). It asks first, then everyone goes back to the lobby with their seats kept, and the
   host starts the next game. People who are only watching do not have the button.

4. **Keep the server window open** and the computer awake while you play. Press `Ctrl+C` in the
   server window to stop. The game is saved after every move.

The invite link stays the same from one evening to the next, so friends can keep it. Starting the
server again carries on the saved game, and everyone gets their own seat back.

### What friends do

Open the link, type a name, pick a seat. That is all. It works on Wi-Fi and on mobile data, on
phones, tablets and computers.

If someone opens the address without the last part (`?join=...`), the page asks for the **invite
code**. It is shown in the host lobby and in the server window, for example `ABCD-EFGH`. Capitals
and the dash do not matter.

---

## Private Tailscale network

Use this when you would rather have no public address at all. Friends connect straight to your
computer through Tailscale's encrypted network (WireGuard). Every player needs Tailscale.

1. Host: install Tailscale and sign in, as above. No HTTPS or Funnel setting is needed.
2. Host: give each friend access to the host computer. In the
   [admin console](https://login.tailscale.com/admin/machines) open the **Machines** page, find
   the host computer, open its **...** menu and choose **Share**. Send the invite it makes.
   (People who are already members of your tailnet need no invite.)
3. Each friend: install Tailscale on the device they will play on, sign in (a free account), and
   accept the invite.
4. Host: start the server and send the link it prints:

   ```bash
   npm run host:tailnet
   ```

   ```text
   INVITE LINK for friends who run Tailscale (encrypted, not public):

       http://100.101.102.103:3210/?join=ABCD-EFGH
       http://your-computer.your-tailnet.ts.net:3210/?join=ABCD-EFGH   (the same, by name)
   ```

   Send the first one, with the numbers. It opens on every device that has Tailscale connected.
   The link with the name only opens where the device also uses Tailscale's DNS; on a phone on
   mobile data it may say the site cannot be reached.

The link begins with `http://` because Tailscale itself does the encrypting. It carries the invite
code as well.

In this mode the server listens only on the computer's Tailscale address. Other people on
whatever Wi-Fi the host computer is using (a café, a hotel) cannot connect at all. To let people
on your own Wi-Fi join directly as well, start with `npm run host:tailnet -- --also-lan`.

## Home Wi-Fi

For people in the same house:

```bash
npm run host
```

The server window lists the addresses friends on the same Wi-Fi can open, for example
`http://192.168.1.20:3210`. On Windows, run `scripts\windows\allow-firewall.ps1` once as
administrator, or double-click `scripts\windows\host-game.cmd` to start. On a Mac, choose
**Allow** if macOS asks whether "node" may accept incoming connections.

---

## When the connection is not perfect

The game is built for laptops that sleep and phones that change networks.

- **A dropped connection comes back by itself.** The badge at the top shows *Reconnecting…* and
  then *Connected*. Nobody loses their seat or their cards. The game waits for the player whose
  turn it is.
- **A silent, dead connection is noticed.** Each browser checks the line every ten seconds, and
  at once when you come back to the tab or the device is online again. A dead line is replaced
  within about twenty seconds.
- **Reloading the page is safe.** The browser remembers the invite code and the seat.
- **Changing device mid-game.** A seat is remembered by the browser that took it. To carry on
  from another phone or computer, open the invite link there, type your name, and press **Take
  over** next to your own seat. This works once the old device has been offline for 30 seconds.
  The same button lets someone stand in for a player who had to leave.
- **The host's computer restarts.** Start the server again with the same command. The saved game
  resumes, and the invite link and the seats still work.

## How it is kept private

- **Encrypted all the way.** With the online link, the HTTPS certificate belongs to the host's
  computer. Tailscale's relay passes the traffic on without being able to read it. On the private
  network, WireGuard encrypts everything between the devices.
- **Invite code.** The server tells a visitor nothing (no names, no seats, no board) until their
  browser presents the code. There are about 850 billion possible codes, and an address that
  sends eight wrong ones is refused for ten minutes.
- **Only the game is reachable.** The online link forwards to the game server and to nothing else
  on the computer. In online mode the server listens only on the host computer itself, so the
  tunnel is the only way in; in private network mode it listens only on the Tailscale address.
  The link stops working the moment the server stops.
- **Each player sees only their own cards.** The server sends every browser its own view of the
  game; other players' hands are never sent.
- **The host link is separate.** The address with `?host=...` controls the game (seats, starting,
  a new game). Keep it to yourself; friends only ever need the invite link.
- **A new code whenever you like.** `npm run host:online -- --new-invite` makes a new invite code;
  links sent earlier stop working.

Two things to know:

- Tailscale publishes the names of computers that get an HTTPS certificate in a public list (this
  is how HTTPS certificates work everywhere). Your computer's Tailscale name, for example
  `arthurs-macbook`, becomes visible there. If the name is personal, rename the machine in the
  Tailscale admin console before turning HTTPS on. This is also why the invite code exists: an
  address can be found, the code cannot.
- Anyone who has the invite link can take a free seat, watch the table, or take over the seat of
  a friend who has been offline for 30 seconds. Send the link only to people you want at the
  table.

## If something does not work

| What you see | What to do |
| --- | --- |
| `Tailscale is not installed on this computer` | Install it from <https://tailscale.com/download>, sign in, start again. |
| `Tailscale is turned off` or `not signed in` | Open the Tailscale app, connect or sign in, start again. |
| The server window keeps showing the `login.tailscale.com` page address | The one-time switch has not been pressed yet. Open that address, enable HTTPS and Funnel, and wait. |
| `The online link is down: ... already exists for port 443` | Another program on this computer already uses Tailscale Funnel on that port. Start with `npm run host:online -- --https-port 8443`. |
| Linux: `Access denied` from Tailscale | Run `sudo tailscale set --operator=$USER` once, then start again. |
| `Could not reach the invite link from this computer yet` | Normal for a brand-new link. Wait a few minutes and let friends try again. |
| A friend's browser says the site cannot be found | The link is new (wait up to ten minutes), or it was cut short when it was copied. Send it again with **Copy link**. |
| A friend sees **Enter the invite code** | They opened the address without `?join=...`. They can type the code, or open the full link. |
| `Too many wrong codes` | Wait ten minutes, then open the full invite link. |
| The badge says *Offline, retrying* for a long time | The host's server is stopped or the host computer is asleep. Wake it, or start the server again. |
| `Port 3210 is already in use` | The server is already running in another window. Close that one, or start with `-- --port 3211`. |
| A friend opened the game on a second device and cannot play | Use **Take over** on their own seat (see above), 30 seconds after closing the first device. |
| Private network: a phone says the site cannot be reached | Use the link with the numbers (`http://100...`), not the one with the name. Check that Tailscale is connected on the phone. |
| Private network: the link does not open at all | Check that Tailscale is connected on the friend's device and that they accepted the invite. On a Mac, choose **Allow** when asked about incoming connections for "node". |
| A friend cannot get in and you cannot tell why | Start with `-- --verbose`. The server window then lists every connection that reaches the computer and where it came from. If nothing appears when the friend tries, their device is not reaching this computer at all. |

To keep a Mac awake while hosting, start the server like this:

```bash
caffeinate -i npm run host:online
```

## Options

Put options after `--`, for example `npm run host:online -- --new-invite`.

| Option | What it does |
| --- | --- |
| `--share lan`, `tailnet` or `online` | How to share the game. `npm run host:online` and `host:tailnet` set this for you. |
| `--port <number>` | Port on the host computer (default 3210). |
| `--https-port <number>` | Public port of the online link: 443 (default), 8443 or 10000. |
| `--invite` | Ask for the invite code on the home Wi-Fi too. (The online link and the private network always ask.) |
| `--new-invite` | Make a new invite code. Links sent earlier stop working. |
| `--also-lan` | Online link and private network: also let people on your own Wi-Fi connect directly. |
| `--no-open` | Do not open the host page in the browser. |
| `--verbose` | List every connection that reaches the computer, with the address it came from. |
| `--help` | Show the options. |

The same settings exist as environment variables: `SHARE`, `PORT`, `FUNNEL_PORT`,
`REQUIRE_INVITE=1`, `NO_OPEN=1`, `SAVES_DIR`, and `TAILSCALE_CLI` (the full path of the
`tailscale` program, if the game cannot find it).

The saved game, the host key and the invite code are in the `saves/` folder. Deleting that folder
starts everything afresh.

### Other tunnels

The game server is an ordinary web server, so any HTTPS tunnel or reverse proxy that supports
WebSockets works in place of Tailscale Funnel (for example a Cloudflare tunnel pointed at
`http://localhost:3210`). Start the server with `npm run host -- --invite` so that the invite code
is required, and send friends `https://<your tunnel address>/?join=<code>`.

## For developers

```bash
npm test                 # unit and server tests (invite gate, Tailscale handling, reconnects)
npm run test:e2e:online  # two browsers on real servers, including the online link over HTTPS
```

The online browser tests put a stand-in for the `tailscale` program in front of the game
(`e2e-online/fake-tailscale.mjs`). It opens a real HTTPS address on `localhost`, forwards to the
game the way Funnel does, and can cut or silence connections to test recovery. The tests use
Google Chrome; without it, set `PW_CHROMIUM_PATH` to any Chromium program.

| File | What it holds |
| --- | --- |
| `server/share.ts` | Finds Tailscale, reads its status, runs and restarts `tailscale funnel`. |
| `server/access.ts` | The invite code and the lock-out for wrong guesses. |
| `server/launch.ts` | Command-line options and the text of the server window. |
| `server/http-server.ts` | Web server: visitor addresses behind the tunnel, limits, pings, compression. |
| `src/ui/online/useOnlineGame.ts` | The browser's connection: invite code, heartbeat, reconnecting. |
