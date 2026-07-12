import { CheckCircle2 } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { siteConfig } from "@/config/site";

const valueProps = [
  {
    title: "Explainable signals",
    detail: "Every signal states why it exists and which strategy produced it.",
  },
  {
    title: "Risk-first validation",
    detail: "Nothing reaches you before passing the Risk Engine.",
  },
  {
    title: "Measured performance",
    detail: "Win rate, expectancy, and drawdown — tracked on every strategy.",
  },
];

/**
 * Authentication shell: brand narrative panel (desktop) + form column.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r p-10 lg:flex">
        {/* Subtle emerald glow anchoring the brand — decoration stops here */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -left-40 size-[480px] rounded-full bg-primary/[0.07] blur-3xl"
        />
        <Brand />

        <div className="relative max-w-md space-y-8">
          <blockquote className="space-y-3">
            <p className="text-3xl font-semibold leading-tight tracking-tight text-balance">
              {siteConfig.motto}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Structured, explainable, statistically validated market
              intelligence — not predictions.
            </p>
          </blockquote>

          <ul className="space-y-4">
            {valueProps.map((prop) => (
              <li key={prop.title} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">{prop.title}</p>
                  <p className="text-sm text-muted-foreground">{prop.detail}</p>
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
        <div className="flex justify-start lg:hidden">
          <Brand />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </div>
  );
}
