import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles, Target } from "lucide-react";
import { AegisMark } from "@/components/layout/aegis-mark";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Aegis Signal — Measure the Market. Protect the Trader.",
  description:
    "A handful of trades worth taking, each one explained — and silence when there are none.",
};

/**
 * The landing page. One screen, no scroll.
 *
 * It has to say the one true thing (AGENTS.md §1) and resist the temptation to
 * say anything else. Most trading products sell *more*: more signals, more
 * indicators, more charts. The entire premise of Aegis is **less** — a handful of
 * trades worth taking, and silence when there are none.
 *
 * So the page sells the silence. That is the differentiator, and it is the line
 * a competitor cannot copy without rebuilding their product.
 */
export default function LandingPage() {
  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-background">
      {/* Ambient depth — one soft emerald bloom, not a light show */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, var(--primary) 0%, transparent 70%)",
          opacity: 0.09,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
      />

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <AegisMark className="size-5" animated />
          </div>
          <span className="text-sm font-semibold tracking-tight">
            {siteConfig.name}
          </span>
        </div>

        <Button asChild variant="ghost" size="sm">
          <Link href="/login">Sign in</Link>
        </Button>
      </header>

      {/* Hero */}
      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.06] px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden />
            Roughly five signals a day. Never more.
          </p>

          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
            Measure the market.
            <br />
            <span className="text-primary">Protect the trader.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Aegis scans every pair on every exchange, applies rules you can read,
            and hands you the few trades worth taking — each one explained, sized,
            and told to you straight.
          </p>

          {/* The line no competitor will put on their homepage */}
          <p className="mx-auto mt-4 max-w-xl text-pretty text-sm text-muted-foreground">
            And when nothing meets the rules,{" "}
            <span className="font-medium text-foreground">
              it tells you that too.
            </span>{" "}
            A quiet day is the system working.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/login">
                Open the terminal
                <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
            >
              <Link href="/register">Create an account</Link>
            </Button>
          </div>

          {/* Three proofs, not three features */}
          <ul className="mx-auto mt-12 grid max-w-lg gap-x-6 gap-y-3 text-left sm:grid-cols-3">
            <Proof icon={Target} title="Explained">
              Every signal shows its arithmetic
            </Proof>
            <Proof icon={ShieldCheck} title="Risk-first">
              Sized from the stop, never the leverage
            </Proof>
            <Proof icon={Sparkles} title="Honest">
              No win rate we have not earned
            </Proof>
          </ul>
        </div>
      </main>

      <footer className="px-6 pb-6 text-center text-xs text-muted-foreground md:px-10">
        Not financial advice. Trading involves risk of loss.
      </footer>
    </div>
  );
}

function Proof({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-2.5 sm:flex-col sm:gap-1.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs leading-snug text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}
