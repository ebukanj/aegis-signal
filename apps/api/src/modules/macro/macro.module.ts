import { Module } from "@nestjs/common";

import { MacroService } from "./macro.service";
import { MacroInterpreter } from "./macro.interpreter";
import { FmpCalendarProvider } from "./macro.provider";
import { MacroWorker } from "./macro.worker";
import { MacroController } from "./macro.controller";

/**
 * MACRO & THE ECONOMIC CALENDAR (M19).
 *
 * The scheduled events that move the whole market at once — the FOMC decision,
 * CPI, NFP. It does two things and nothing else: it PROTECTS (raises a macro
 * window so the trader stands down around a release) and it INTERPRETS (reads the
 * surprise once the number prints). Both are context — it never creates, blocks,
 * or sizes a trade (ADR-023 §5); the deterministic pipeline still owns the signal.
 *
 * It ships a built-in FOMC schedule so it works with zero configuration, and takes
 * a live provider (`ECONOMIC_CALENDAR_API_KEY`) for the full calendar when one is
 * available. It exports its service so any surface can ask "is a macro window
 * open?" without recomputing it.
 */
@Module({
  controllers: [MacroController],
  providers: [MacroService, MacroInterpreter, FmpCalendarProvider, MacroWorker],
  exports: [MacroService],
})
export class MacroModule {}
