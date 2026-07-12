# راهنمای توسعه — Cisco VPN GNOME Extension

## خلاصه پروژه

اکستنشن GNOME Shell برای اتصال به Cisco AnyConnect از طریق `openconnect` با پشتیبانی TOTP.

- **UUID:** `cisco-vpn@charisma.ir`
- **ورودی اصلی:** `extension.js`
- **GNOME Shell:** 45, 46 (Ubuntu 24.04+)
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
