import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { siteConfig } from "@/config/site";

/**
 * The claims here must be ones the product can actually keep.
 *
 * The old panel promised "win rate, expectancy and drawdown — tracked on every
 * strategy". That was true of the mock and false of the platform: nothing has
 * settled, so there is no win rate to show. Promising it on the sign-in screen
 * is the same lie as a random 91%, told earlier (ADR-024).
 *
 * What is left is what is true today — and it is a stronger pitch anyway.
 */
const valueProps = [
  {
    title: "Rules you can read",
    detail:
      "Every strategy is written in plain English. No black box, no 'the AI thinks so'.",
  },
  {
    title: "Risk before profit",
    detail:
      "Nothing reaches you before the Risk Engine has had its chance to say no.",
  },
  {
    title: "Silence when it's right",
    detail:
      "A quiet day is the rules working. We would rather show you nothing than something mediocre.",
  },
];

/** Authentication shell: brand narrative panel (desktop) + form column. */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r p-10 lg:flex">
        {/* One soft emerald bloom, matching the landing page. Decoration stops here. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 -top-40 size-[520px] rounded-full bg-primary/[0.08] blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
        />

        <Link
          href="/"
          className="relative w-fit rounded-md transition-opacity hover:opacity-80"
        >
          <Brand />
        </Link>

        <div className="relative max-w-md space-y-8">
          <blockquote className="space-y-3">
            <p className="text-balance text-3xl font-semibold leading-tight tracking-tight">
              {siteConfig.motto}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              A handful of trades worth taking, each one explained — and nothing
              at all when there are none.
            </p>
          </blockquote>

          <ul className="space-y-4">
            {valueProps.map((prop) => (
              <li key={prop.title} className="flex gap-3">
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-medium">{prop.title}</p>
                  <p className="text-sm leading-snug text-muted-foreground">
                    {prop.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="label-caps relative">
          Institutional-grade crypto market intelligence
        </p>
      </div>

      {/* Form column */}
      <div className="flex flex-col p-6 md:p-10">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="lg:hidden">
            <Brand />
          </Link>
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Back
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </div>
  );
}
