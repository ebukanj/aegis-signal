import { redirect } from "next/navigation";

/**
 * Signals is the platform's home.
 *
 * Aegis Signal does one thing: hand the trader the few trades worth taking
 * today. That belongs on the first screen — not behind a summary of summaries
 * (AGENTS.md §1).
 */
export default function RootPage() {
  redirect("/signals");
}
