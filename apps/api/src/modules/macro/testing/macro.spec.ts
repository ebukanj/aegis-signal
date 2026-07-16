import { describe, expect, it } from "vitest";
import type { EconomicEvent } from "@aegis/contracts";

import { MacroInterpreter } from "../macro.interpreter";
import { MacroService } from "../macro.service";
import type { FmpCalendarProvider } from "../macro.provider";

function event(over: Partial<EconomicEvent>): EconomicEvent {
  return {
    id: "e1",
    title: "CPI",
    country: "US",
    category: "INFLATION",
    impact: "HIGH",
    time: new Date().toISOString(),
    forecast: null,
    previous: null,
    actual: null,
    interpretation: null,
    source: "test",
    ...over,
  };
}

describe("MacroInterpreter — reading the surprise", () => {
  const interp = new MacroInterpreter();

  it("says nothing until the number prints", () => {
    expect(interp.interpret(event({ forecast: "3.2%", actual: null }))).toBeNull();
  });

  it("hot inflation is RISK_OFF, cool is RISK_ON", () => {
    expect(interp.interpret(event({ forecast: "3.2%", actual: "3.5%" }))?.direction).toBe("RISK_OFF");
    expect(interp.interpret(event({ forecast: "3.2%", actual: "2.9%" }))?.direction).toBe("RISK_ON");
    expect(interp.interpret(event({ forecast: "3.2%", actual: "3.2%" }))?.direction).toBe("NEUTRAL");
  });

  it("a rate cut is RISK_ON, a hike RISK_OFF", () => {
    const cut = event({ category: "RATES", title: "FOMC", previous: "5.50%", actual: "5.25%" });
    const hike = event({ category: "RATES", title: "FOMC", previous: "5.25%", actual: "5.50%" });
    expect(interp.interpret(cut)?.direction).toBe("RISK_ON");
    expect(interp.interpret(hike)?.direction).toBe("RISK_OFF");
  });

  it("refuses false precision on two-sided data (jobs)", () => {
    const nfp = event({ category: "EMPLOYMENT", title: "Nonfarm Payrolls", forecast: "180K", actual: "250K" });
    expect(interp.interpret(nfp)?.direction).toBe("NEUTRAL");
  });
});

describe("MacroService — the stand-down window", () => {
  const fakeProvider = (events: EconomicEvent[]): FmpCalendarProvider =>
    ({ available: () => true, fetch: async () => events }) as unknown as FmpCalendarProvider;

  it("opens a window when a HIGH-impact event is within 30 minutes", async () => {
    const now = Date.now();
    const soon = event({ id: "soon", time: new Date(now + 10 * 60_000).toISOString() });
    const service = new MacroService(fakeProvider([soon]), new MacroInterpreter());
    await service.refresh(now);

    const window = service.window(now);
    expect(window.active).toBe(true);
    expect(window.minutesUntil).toBe(10);
  });

  it("stays closed when the next event is hours away", async () => {
    const now = Date.now();
    const later = event({ id: "later", time: new Date(now + 5 * 3_600_000).toISOString() });
    const service = new MacroService(fakeProvider([later]), new MacroInterpreter());
    await service.refresh(now);

    expect(service.window(now).active).toBe(false);
  });
});
