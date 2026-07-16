# Telegram Signals — Activation Guide

> Get Aegis Signal's Prime signals and your watchlist alerts delivered to
> Telegram, free, in under five minutes. No public URL, no webhook, no paid plan.

Telegram delivery is **off until a bot token is set**. Once it is, any user can
connect their own chat from **Settings → Integrations → Telegram**.

---

## 1. Create your bot (once, by the operator)

1. Open Telegram and message [**@BotFather**](https://t.me/BotFather).
2. Send `/newbot`. Give it a **name** (e.g. `My Aegis Signal`) and a **username**
   that ends in `bot` (e.g. `my_aegis_signal_bot`).
3. BotFather replies with a **token** that looks like
   `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`. Keep it secret — it is the
   password to your bot.

That is the whole of it. The bot needs **no** special permissions and stays private
to the people you give the link to.

---

## 2. Tell Aegis Signal about the bot

Set two environment variables and restart the API:

```dotenv
# apps/api/.env  (or your Coolify service environment)
TELEGRAM_BOT_TOKEN=123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_BOT_USERNAME=my_aegis_signal_bot   # optional — auto-detected if omitted
```

On boot you will see `Telegram link polling armed` in the logs. That is the bot
listening for people to connect — it **long-polls** Telegram, so nothing needs to be
publicly reachable (perfect for a Coolify box behind Cloudflare).

> **Nothing else changes.** With no token the Telegram channel simply reports
> "Unavailable" and every other channel carries on. The token is the only switch.

---

## 3. Connect your chat (each user, in the app)

1. Go to **Settings → Integrations → Telegram** and press **Connect Telegram**.
2. Telegram opens on your bot; press **Start**.
3. The card flips to **Connected**. Done — you are linked.

Behind the scenes the app hands Telegram a one-time code (valid 15 minutes); pressing
Start sends it back, and the backend ties that chat to your account. Send **`/stop`**
to the bot at any time, or press **Disconnect**, to unlink.

---

## 4. What you'll receive, and what you won't

Telegram is deliberately **not** a firehose. You get a message only when:

- a **Prime** signal publishes (the few the platform stakes its name on), **or**
- a signal publishes on a coin that is on **your watchlist**.

A user with no watchlist and no Prime signals gets nothing — you opt into the coins
you care about by **watching them** on the Signals page. Quiet hours (in your
notification preferences) still apply, and the same signal never reaches you twice.

---

## WhatsApp?

WhatsApp's free tier needs a Meta Business app, a verified number, and approved
message templates — real setup friction that Telegram does not have. It is wired
behind the same channel interface and will activate the same way once
`WHATSAPP_API_KEY` and a template are in place; Telegram is the recommended free
channel to start with.
