import { Global, Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";

/**
 * In-process event bus.
 *
 * `wildcard: true` lets a listener subscribe to `signal.*` — used by the audit
 * log and the ledger, which care about everything a signal does without wanting
 * to enumerate it.
 */
@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: ".",
      // A listener that throws must not take down the emitter — a broken audit
      // logger cannot be allowed to stop a signal from being published.
      ignoreErrors: false,
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
  ],
})
export class EventsModule {}
