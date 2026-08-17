# Deploying on Alpine Linux behind NginxProxyManager

The start-to-finish runbook for the school deployment: Alpine Linux, Node 26,
2 vCPU / 4 GB RAM / 60 GB disk, behind NginxProxyManager terminating TLS, with
an internal send-only SMTP relay for staff password-setup email.

Every site-specific value (hostnames, addresses, ports, keys) is a
`<placeholder>` you fill in. This repository is public and deliberately contains
none of them.

`DEPLOY.md` is the general guide and assumes systemd. **Alpine has no systemd** —
use the OpenRC service in this document instead. Everything else in DEPLOY.md
still applies.

---

## 0. Repository access: a read-only deploy key

The repo is <https://github.com/CrossGen-AI-Public/SMHS-app>. It is **not
public**, so a plain `git clone` fails. Access is granted with a **deploy key**:
one SSH key that can read this one repository and nothing else. No GitHub
account is needed on the server, and the key cannot write to the repo or reach
anything else in the organization.

The private half of the key never leaves the app server. Generate it there:

```sh
apk add git openssh

# Unprivileged system user that owns the app and runs the service.
# The group is created separately on purpose: busybox `adduser -S` does not
# create a matching group, and every chown below (plus the OpenRC service,
# which runs as smapp:smapp) needs it to exist.
addgroup -S smapp
adduser -S -D -H -h /opt/smapp -s /sbin/nologin -G smapp smapp
mkdir -p /opt/smapp/.ssh
chown -R smapp:smapp /opt/smapp
chmod 700 /opt/smapp/.ssh

su -s /bin/sh smapp -c 'ssh-keygen -t ed25519 -N "" -C "smapp deploy key" -f /opt/smapp/.ssh/id_ed25519'

# Send THIS (the .pub file, one line) back to us. Never send id_ed25519.
cat /opt/smapp/.ssh/id_ed25519.pub
```

We add that public key to the repository under **Settings → Deploy keys → Add
deploy key**, with "Allow write access" left unchecked, and confirm when it is
live. Then check the key works:

```sh
su -s /bin/sh smapp -c 'ssh -o StrictHostKeyChecking=accept-new -T git@github.com'
```

`Hi CrossGen-AI-Public/SMHS-app! You've successfully authenticated, but GitHub
does not provide shell access.` is the success message. That command also pins
GitHub's host key into `/opt/smapp/.ssh/known_hosts`, which the clone in §2
needs.

If outbound SSH on port 22 is blocked, use GitHub's SSH-over-443 endpoint
instead of opening the firewall — put this in `/opt/smapp/.ssh/config`
(`chown smapp:smapp`, `chmod 600`) and everything below works unchanged:

```
Host github.com
    HostName ssh.github.com
    Port 443
    User git
```

---

## 1. Server prerequisites

Node 26.3.1 and npm 11.12.1 are already installed, and that is a supported
version — verified: a clean `npm ci` + `next build` + full boot on
Alpine 3.24 with Node 26 and musl, including `node:sqlite`, which the server
uses for staff accounts and push subscriptions.

The only extra packages are `git` and `openssh`, both already installed in §0.
Git is not optional in a git-based deployment: `start-prod.sh` uses it to detect
when a `git pull` changed the code and a rebuild is needed. Without git the
script says so out loud and you must pass `--build` by hand after every update.

No swap is needed. The production build peaks well under this box's 4 GB
(measured: the whole app serves at ~45 MB resident).

---

## 2. Clone the code into /opt/smapp

`/opt/smapp` already exists and holds the deploy key from §0, so clone **into**
it rather than over it:

```sh
su -s /bin/sh smapp -c 'git clone git@github.com:CrossGen-AI-Public/SMHS-app.git /tmp/smapp-clone'
su -s /bin/sh smapp -c 'cp -a /tmp/smapp-clone/. /opt/smapp/ && rm -rf /tmp/smapp-clone'
chown -R smapp:smapp /opt/smapp
```

Run every git command in this document as the `smapp` user, as above. Git
refuses to operate on a tree owned by someone else ("dubious ownership"), so
`git pull` as root will fail here.

Confirm the clone landed:

```sh
ls /opt/smapp/start-prod.sh /opt/smapp/DEPLOY-SMHS.md
```

---

## 3. `/opt/smapp/.env`

```sh
cp /opt/smapp/.env.example /opt/smapp/.env
chown smapp:smapp /opt/smapp/.env && chmod 0600 /opt/smapp/.env
```

Then set these. **The values in angle brackets are yours to fill in** — this is a
public repository, so it carries no site addresses.

```sh
PORT=<port the app listens on>          # e.g. 3000
HOST=0.0.0.0                            # see the warning below before accepting this
APP_ORIGIN=https://<the app's public hostname>

# Internal send-only relay: anonymous, no AUTH, plain SMTP.
SMTP_HOST=<relay address>
SMTP_PORT=<relay port>                  # 25 for a typical internal relay
SMTP_USER=                              # both MUST stay empty for an anonymous relay
SMTP_PASS=
SMTP_FROM="SMCHS App <no-reply@your-domain>"

TRUST_PROXY=1                           # correct for NginxProxyManager, see §4

CALENDAR_API_KEY=<BellCalSync key>      # optional, see the note below
```

| Value | Where it comes from |
| --- | --- |
| `PORT` | Whatever the reverse proxy will forward to. Anything free. |
| `APP_ORIGIN` | The public HTTPS address users will type. It is baked into emailed password-setup links and is deliberately never read from the request, so it must be exact, including the scheme. |
| `SMTP_HOST` / `SMTP_PORT` | Your internal send-only relay. |
| `SMTP_FROM` | The sender address that relay is allowed to send as. |
| `CALENDAR_API_KEY` | The school's BellCalSync key. Leave it empty and the app falls back to the public CalendarWiz feed, which works; the key just makes the schedule authoritative. |

Leave `ALLOW_TEST_ACCOUNTS` and `NEXT_PUBLIC_TEST_ACCOUNTS` **unset**. They
enable passwordless test identities and are an account-takeover risk in
production. The server prints a loud yellow banner at boot if either is set.

`SMTP_USER`/`SMTP_PASS` must be **both empty** — the relay takes no
authentication. Setting only one is rejected outright, deliberately, so a typo
cannot silently downgrade an authenticated setup to plaintext.

### ⚠ The one decision that is not just a value to type: `HOST`

The app speaks **plain HTTP** on `$PORT`, and staff bearer tokens travel over it.

- **Reverse proxy on the same host** → set `HOST=127.0.0.1`. Nothing off-box can
  reach the unencrypted port. This is the safest configuration, and the default
  if you leave `HOST` unset.
- **Reverse proxy on a different host** → `HOST=0.0.0.0` is required, *and* the
  firewall must restrict the app's port to the proxy's address only:

  ```sh
  apk add iptables ip6tables
  iptables -A INPUT -p tcp --dport <PORT> -s <proxy address> -j ACCEPT
  iptables -A INPUT -p tcp --dport <PORT> -j DROP
  rc-update add iptables default && /etc/init.d/iptables save
  ```

  Without that rule, anyone on the internal network can read and write the app's
  API directly over unencrypted HTTP, bypassing TLS entirely. Do not set
  `HOST=0.0.0.0` and skip the firewall.

`MCP_PORT` defaults to 8181 on localhost and serves a read-only tool set for AI
clients (see `docs/MCP.md`). It is not needed for the app: set `MCP_PORT=0` in
`.env` to turn it off unless you want it.

---

## 4. NginxProxyManager

Add a **Proxy Host**:

| Field | Value |
| --- | --- |
| Domain Names | the app's public hostname (same as `APP_ORIGIN`, without the scheme) |
| Scheme | `http` |
| Forward Hostname / IP | the app server's address |
| Forward Port | the `PORT` from §3 |
| Cache Assets | **off** (the app manages its own caching; HTML and `sw.js` must stay `no-cache` so deploys reach devices) |
| Block Common Exploits | on (harmless here) |
| Websockets Support | **not needed** — the app uses plain HTTP requests only |
| SSL | issue the certificate, then enable **Force SSL** and **HTTP/2**; HSTS is fine |

NginxProxyManager's defaults already send everything this app needs:

- `X-Forwarded-Proto` — makes the staff session cookie `Secure`. Verified: with
  that header present the server sets
  `smchs_staff=…; Path=/; HttpOnly; SameSite=Lax; Max-Age=15552000; Secure`.
- `X-Forwarded-For` — the auth rate limiter reads the **last** hop, the one the
  proxy itself appended, so `TRUST_PROXY=1` is safe. Verified: after 10 failed
  logins the 11th returns 429, and further attempts each carrying a *forged*
  `X-Forwarded-For` stayed 429. A caller cannot mint a fresh bucket.
- `Cookie` / `Set-Cookie` pass through untouched. Do not add any rule that
  strips or rewrites them: that cookie is what keeps staff signed in on iOS,
  where WebKit clears script-writable storage on its own schedule.

One setting worth making explicit: allow request bodies up to at least **2 MB**
(NginxProxyManager's *Advanced* tab: `client_max_body_size 2m;`). The app accepts
admin publishes up to 1 MB, and stock nginx caps request bodies at 1 MB — if that
default is in effect, a large publish is rejected with a 413 that reaches the
admin as a failed save. Setting it explicitly removes the question.

---

## 5. Run it under OpenRC

```sh
install -m 755 /opt/smapp/deploy/openrc/smapp /etc/init.d/smapp
rc-update add smapp default
rc-service smapp start
rc-service smapp status
tail -f /var/log/smapp.log
```

The first start installs dependencies and builds the app (a few minutes); later
starts reuse the build. The service restarts on crash and comes back at boot.

Expect this in the log, and nothing alarming:

```
Serving app + API on http://0.0.0.0:<PORT>
[mail] anonymous relay mode: SMTP to <relay address>:<port>, no AUTH (unencrypted)
SMCHS app + API on http://0.0.0.0:<PORT>
```

The `(unencrypted)` note is expected and correct for an internal relay: the
message crosses the school's own network in the clear. It carries a live
password-setup link, which is why the relay must stay internal.

Health check for monitoring: `GET /api/health` → `{"ok":true,…}`.

**Run exactly one instance.** The auth rate limiter is per-process, so a second
instance doubles the allowance. One is far more than enough — see §8.

---

## 6. Backups

```sh
install -m 755 /opt/smapp/deploy/smapp-backup.sh /usr/local/bin/smapp-backup.sh
echo '15 2 * * * /usr/local/bin/smapp-backup.sh' >> /etc/crontabs/root
rc-service crond restart
```

Writes a dated `tar.gz` to `/var/backups/smapp/`, keeps the newest 14, mode 0600.
It captures the three files the app cannot rebuild:

- `server/.data/data.json` — everything admins publish
- `server/.data/auth.db` — staff accounts and password digests
- `server/.data/push.db` — push subscriptions **and the VAPID keypair** (losing
  the keypair silently orphans every device's notifications)

Caches (`schedule-history.json`, `staff.json`, `tiles/`) are excluded on purpose;
they rebuild from smhs.org.

**Please ship these off-box too.** A backup that only lives on the server dies
with the server.

Restore = stop the service, unpack the archive into `server/.data/`, start it.
Verified end to end: after deleting all three files and restoring from an
archive, a staff account still signed in and published content was intact.

---

## 7. Updating

```sh
su -s /bin/sh smapp -c 'git -C /opt/smapp pull'
rc-service smapp restart
```

`start-prod.sh` reinstalls dependencies when the lockfile moved and rebuilds
whenever the checkout no longer matches the last build, so a restart cannot
serve a stale bundle. Devices pick the update up on their next load.

---

## 8. What was verified before handover

Tested against a clean `git clone` of this repo, built and booted by
`start-prod.sh` with the configuration above:

- **Alpine + Node 26 + musl**: clean `npm ci`, `next build`, boot, and
  `node:sqlite` all work. npm resolves the musl-specific build toolchain from
  the committed lockfile.
- **The mail path, end to end, against a real SMTP server**: anonymous relay,
  no AUTH, plain SMTP. The message arrives with the configured envelope sender
  and a working setup link on the configured `APP_ORIGIN`.
- **The whole staff account lifecycle**: request setup link → receive email →
  set password → sign in → publish → sign in again from a cold start. This was
  the one path never previously exercised.
- **Authorization**: a signed-in non-admin teacher is refused with 403 on a
  shared-data write; an Ed Tech / Dean's / President's / Principal's office
  account is admitted automatically from the directory, so there is no
  first-admin bootstrap step.
- **Concurrent-write protection**: a write without `If-Match` is rejected (428),
  a stale one is rejected (412).
- **Rate limiting** holds against forged `X-Forwarded-For` (see §4).
- **The full UI on an iPhone-sized browser**: all 15 routes render; an admin
  signed in through the real portal, published a school-wide notice, and a
  separate device received it.
- **Capacity on hardware matched to this box** (2 vCPU / 4 GB, Alpine
  container): 589 requests/second sustained with zero errors, p99 16 ms, 41 MB
  resident. Launch day is estimated at ~200 req/s (6000 devices polling every
  30 s), so there is roughly 3× headroom.
- **Backup and restore**, including a live sign-in after restore (§6).
- **Timezone independence**: the schedule is identical with the server clock in
  UTC and in `America/Los_Angeles`, so the host timezone does not matter.

Not verified, and worth knowing:

- The school's own NginxProxyManager instance and mail relay were not reachable
  from the development environment. The proxy guidance in §4 is based on
  NginxProxyManager's documented default headers, and the mail path was proven
  against a standards-compliant SMTP server configured the same way (anonymous,
  no AUTH, no TLS). Both are worth a five-minute confirmation once live: send
  yourself a setup link, and check that a signed-in staff session survives a
  browser restart.
- The OpenRC service (§5) was syntax-checked and loaded by OpenRC on Alpine
  (`rc-service smapp describe` reads it correctly), but never started under a
  real OpenRC init, which a container cannot provide. If it gives trouble,
  running `./start-prod.sh` directly is the path that was tested exhaustively,
  and everything it does is identical.
- `CALENDAR_API_KEY` was empty in testing, so the app ran on its public
  CalendarWiz fallback feed. It works; the key just makes the schedule
  authoritative.
