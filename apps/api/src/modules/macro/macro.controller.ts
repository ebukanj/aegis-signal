import { Controller, Get } from "@nestjs/common";
import type { EconomicCalendar } from "@aegis/contracts";

import { MacroService } from "./macro.service";

/**
 * The macro read API. Public, like the rest of the market context — knowing the
 * FOMC is in twenty minutes is not privileged information.
 */
@Controller("macro")
export class MacroController {
  constructor(private readonly macro: MacroService) {}

  @Get("calendar")
  calendar(): EconomicCalendar {
    return this.macro.calendar();
  }
}
