# راهنمای توسعه — Cisco VPN GNOME Extension

## خلاصه پروژه

اکستنشن GNOME Shell برای اتصال به Cisco AnyConnect از طریق `openconnect` با پشتیبانی TOTP.

- **UUID:** `cisco-vpn@charisma.ir`
- **ورودی اصلی:** `extension.js`
- **GNOME Shell:** 45–50 (Ubuntu 24.04–26.04)
- **رابط VPN اختصاصی:** `cscovpn0` (ثابت در `constants.js`)

## مسیر نصب (مهم!)

تغییرات در repo تا وقتی کپی نشوند اعمال نمی‌شوند:

```bash
EXT_DIR=~/.local/share/gnome-shell/extensions/cisco-vpn@charisma.ir
rsync -av --exclude='.git' /home/ahmad/work/mine/pardazeshcisco/gnome-cisco-vpn/ "$EXT_DIR/"
# یا:
bash INSTALL.sh

# سپس reload:
# Alt+F2 → r → Enter
```

## معماری — فایل‌های کلیدی

| فایل | نقش |
|------|-----|
| `extension.js` | UI پنل، منو، مانیتور ۲ ثانیه‌ای |
| `vpnManager.js` | connect/disconnect، دستور openconnect |
| `network.js` | PID، tunnel، IP — فقط `cscovpn0` |
| `notifier.js` | نوتیفیکیشن — **فقط `Main.notify`** |
| `session.js` | IP، gateway، duration |
| `stateMachine.js` | disconnected / connecting / connected |
| `bootstrap.js` | DI و wiring |
| `constants.js` | PID file، interface name، icons |

## جریان اتصال

```
Connect → notifier.connecting()
       → sudo openconnect --background --interface=cscovpn0 --pid-file=...
       → 2s wait → getVpnIp() از cscovpn0
       → state.connected() + notifier.connected()
```

مانیتور `extension.js` هر ۲ ثانیه `network.connected()` را چک می‌کند.

## تشخیص اتصال

```js
network.connected() = processExists() && hasTunnel()
// processExists: PID در /tmp/openconnect-cisco.pid + ps
// hasTunnel: فقط رابط cscovpn0
```

## Routing & DNS (Settings → Routing & DNS)

- **Route Metric** (default `60`) — after connect, all routes on `cscovpn0` are retagged with this metric. Lower metric wins for overlapping destinations (other VPN clients often use `50`).
- **Leave VPN Domains empty** — openconnect + vpnc-script apply routes/DNS from Cisco server (default, recommended).
- **Custom DNS** — optional override on `cscovpn0`.
- **VPN Domains** — optional extra `resolvectl domain` scoping; only applied when VPN DNS is detected or Custom DNS is set.

Extension does NOT remove default routes or invent destinations; it only sets metric on routes already installed for `cscovpn0`.

## Diagnostics (when sites don't load)

```bash
# 1. VPN interface + DNS
ip addr show dev cscovpn0
resolvectl status cscovpn0

# 2. DNS must show link: cscovpn0 (not your Wi-Fi/USB ethernet)
resolvectl query desk.charisma.digital --cache=no
resolvectl query kasra.charisma.ir --cache=no

# 3. Route must go via cscovpn0
ip route get $(getent ahostsv4 desk.charisma.digital | awk '{print $1; exit}')

# 4. Connectivity
curl -sv --connect-timeout 5 https://desk.charisma.digital/
ping -c 2 desk.charisma.digital

# 5. Extension logs
journalctl -f -o cat /usr/bin/gnome-shell | grep -i ciscovpn
```

If DNS shows `link: enx...` instead of `cscovpn0`, set **Custom DNS** in settings to VPN DNS servers.

## باگ‌های شناخته‌شده

1. **IP VPN دیگر:** اگر اکستنشن قطع باشد ولی VPN دیگری وصل باشد — با commit `f8bd5dc` حل شد (IP فقط از `cscovpn0`).
2. **نوتیف «وصل شد» بعد از قطع:** دو علت — (الف) `connect()` دیر تمام می‌شد و `connected()` را بعد از disconnect صدا می‌زد، (ب) باگ صف نوتیف GNOME 46. اصلاح: `spawnDetached` + polling + `_connectAttempt` guard + لغو timeout نوتیف connected هنگام disconnect.
3. **دو نوتیف هنگام قطع دستی:** `disconnected` + `connectionLost` — با `_intentionalDisconnect` فقط `disconnected` نمایش داده می‌شود.

## دیباگ

```bash
# لاگ اکستنشن
journalctl -f -o cat /usr/bin/gnome-shell | grep -i ciscovpn

# وضعیت openconnect
cat /tmp/openconnect-cisco.pid
ip -j addr show dev cscovpn0

# وضعیت اکستنشن
gnome-extensions info cisco-vpn@charisma.ir
```

## قوانین تغییر

- تغییرات را **حداقلی** نگه دار
- `notifier.js` را با `Main.notify(title, message)` نگه دار — تغییر به MessageTray شکست خورد
- IP و tunnel فقط از `cscovpn0` — نه همه `tun*`
- IP در UI فقط وقتی `state.isConnected()`
- commit فقط وقتی کاربر صریحاً بخواهد
