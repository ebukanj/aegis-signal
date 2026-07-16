import { Injectable } from "@nestjs/common";
import type {
  NotificationPriority,
  NotificationType,
  PublishedSignal,
  RenderedMessage,
} from "@aegis/contracts";

/**
 * Turns a platform event into the message a trader reads.
 *
 * ── Rendered once, deterministically, and never by AI ──
 *
 * Templates are pure functions of their input: the same signal always renders the
 * same message, in every language of markdown and plain text, with no model in the
 * loop (AI-generated notification content is explicitly out of scope). That
 * determinism is what makes the dedup id stable and the tests assertable, and it is
 * the same principle as everywhere else in the platform — a message a trader acts
 * on is not something a language model improvises.
 *
 * Every signal message carries the execution facts a trader needs to act in
 * seconds — direction, entry, stop, targets, confidence, the strategy — plus a deep
 * link. The medium changes (Telegram wants markdown, SMS wants plain); the facts do
 * not.
 */
@Injectable()
export class TemplateRenderer {
  /* ── Signal events ─────────────────────────────────────────────── */

  primeSignal(signal: PublishedSignal): RenderedMessage {
    return this.signalMessage("🔴 PRIME SIGNAL", signal);
  }

  signalPublished(signal: PublishedSignal): RenderedMessage {
    return this.signalMessage("New signal", signal);
  }

  private signalMessage(label: string, s: PublishedSignal): RenderedMessage {
    const dir = s.direction === "LONG" ? "LONG ▲" : "SHORT ▼";
    const rate = s.confidence.displayedWinRate;
    const conf = rate === null ? `score ${s.confidence.score} (uncalibrated)` : `${rate.toFixed(0)}% (${s.confidence.basis.toLowerCase()})`;
    const lev = s.suggestedLeverage ? ` · ${s.suggestedLeverage}x` : " · spot";
    const tps = s.takeProfits.map((t) => fmt(t)).join(" / ");
    const title = `${label}: ${s.symbol} ${dir}`;

    const markdown = [
      `*${escape(title)}*`,
      ``,
      `Entry \`${fmt(s.entryPrice)}\`  ·  Stop \`${fmt(s.stopLoss)}\`  ·  TP \`${tps}\``,
      `Confidence ${conf}  ·  Confluence ${s.confluence.score}${lev}`,
      `Strategy: ${s.strategies.join(", ")}  ·  ${s.timeframe}  ·  ${s.regime}`,
    ].join("\n");

    const plain = `${title}\nEntry ${fmt(s.entryPrice)} · Stop ${fmt(s.stopLoss)} · TP ${tps}\nConfidence ${conf} · Confluence ${s.confluence.score}${lev}\nStrategy: ${s.strategies.join(", ")} · ${s.timeframe}`;

    return { title, markdown, plain, link: `/signals/${s.id}` };
  }

  /* ── Outcome events ────────────────────────────────────────────── */

  takeProfit(symbol: string, signalId: string, realisedR: number): RenderedMessage {
    const title = `✅ Take profit: ${symbol} +${realisedR.toFixed(2)}R`;
    return {
      title,
      markdown: `*${escape(title)}*\nThe trade reached its target. Manage the runner or bank it.`,
      plain: `${title}\nThe trade reached its target.`,
      link: `/signals/${signalId}`,
    };
  }

  stopLoss(symbol: string, signalId: string): RenderedMessage {
    const title = `🛑 Stop hit: ${symbol} −1R`;
    return {
      title,
      markdown: `*${escape(title)}*\nThe stop was reached. The thesis is invalidated — do not average down.`,
      plain: `${title}\nThe stop was reached. Do not average down.`,
      link: `/signals/${signalId}`,
    };
  }

  signalExpired(symbol: string, signalId: string): RenderedMessage {
    const title = `⌛ Expired: ${symbol}`;
    return {
      title,
      markdown: `*${escape(title)}*\nThe setup aged out without triggering. No action needed.`,
      plain: `${title}\nThe setup aged out without triggering.`,
      link: `/signals/${signalId}`,
    };
  }

  /* ── Risk & platform events ────────────────────────────────────── */

  riskAlert(coin: string, kind: string, headline: string): RenderedMessage {
    const title = `⚠️ Risk flag: ${coin} (${kind})`;
    return {
      title,
      markdown: `*${escape(title)}*\n${escape(headline)}\n\nSignals on ${coin} are blocked while this is active.`,
      plain: `${title}\n${headline}\nSignals on ${coin} are blocked while this is active.`,
      link: `/insights`,
    };
  }

  strategyDisabled(strategyId: string, expectancy: number): RenderedMessage {
    const title = `📉 Strategy switched off: ${strategyId}`;
    return {
      title,
      markdown: `*${escape(title)}*\nRolling expectancy went negative (${expectancy.toFixed(2)}R). The platform disabled it automatically.`,
      plain: `${title}\nRolling expectancy went negative (${expectancy.toFixed(2)}R).`,
      link: `/strategies`,
    };
  }

  exchangeOffline(exchange: string): RenderedMessage {
    const title = `🔌 Exchange offline: ${exchange}`;
    return {
      title,
      markdown: `*${escape(title)}*\nThe platform lost its connection to ${exchange}. Prices from it may be stale.`,
      plain: `${title}\nThe platform lost its connection to ${exchange}.`,
      link: null,
    };
  }

  macroImminent(eventTitle: string, minutesUntil: number): RenderedMessage {
    const title = `⚠️ ${eventTitle} in ~${minutesUntil} min`;
    const body =
      "High-impact macro release imminent — expect volatility. Consider standing down or sizing down; stops get hit on noise around the print.";
    return {
      title,
      markdown: `*${escape(title)}*\n${body}`,
      plain: `${title}\n${body}`,
      link: null,
    };
  }

  system(headline: string, detail: string): RenderedMessage {
    return {
      title: headline,
      markdown: `*${escape(headline)}*\n${escape(detail)}`,
      plain: `${headline}\n${detail}`,
      link: null,
    };
  }

  /* ── Priority mapping — the one place event → urgency is decided ── */

  priorityFor(type: NotificationType): NotificationPriority {
    switch (type) {
      case "STOP_LOSS":
      case "RISK_ALERT":
      case "EXCHANGE_OFFLINE":
        return "CRITICAL";
      case "PRIME_SIGNAL":
      case "TAKE_PROFIT":
      case "STRATEGY_DISABLED":
        return "HIGH";
      case "SIGNAL_PUBLISHED":
      case "SIGNAL_TRIGGERED":
      case "MAINTENANCE":
      case "SYSTEM_ANNOUNCEMENT":
        return "MEDIUM";
      default:
        return "LOW";
    }
  }
}

function fmt(price: number): string {
  if (price >= 1000) return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price >= 1) return price.toFixed(2);
  return price.toPrecision(4);
}

/** Escape Telegram/markdown control chars in interpolated values. */
function escape(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}
