import { Logger } from "@nestjs/common";
import { Resolver } from "node:dns/promises";
import type { LookupAddress, LookupOptions } from "node:dns";

/**
 * A DNS resolver the local network does not control.
 *
 * Some ISPs — and most corporate and national filters — block cryptocurrency
 * exchanges at the DNS layer. The block is invisible in the way that matters:
 * `api.binance.com` simply fails to resolve, so the adapter reports
 * `ENOTFOUND` and looks for all the world like an exchange outage. The exchange
 * is fine. The resolver is lying.
 *
 * When `EXCHANGE_DNS_SERVERS` is set, exchange hostnames are resolved through
 * those servers instead of the operating system's. **Nothing else in the process
 * is affected** — this is not a global override, it is a lookup function handed
 * to the two places that talk to exchanges (ccxt's undici dispatcher, and the
 * WebSocket). Postgres, Redis and every other host still resolve normally.
 *
 * In production this is expected to be UNSET, and the OS resolver is used. A VPS
 * has no reason to filter the exchanges we depend on, and pinning DNS servers we
 * do not run would be an outage waiting for someone else's schedule.
 *
 * ── Why this cannot be `dns.setServers()` ──
 *
 * Because `dns.setServers()` does not do what its name suggests. It configures
 * the `dns.resolve*` family only. Both `fetch` and `ws` connect through
 * `dns.lookup`, which calls the operating system's `getaddrinfo` and ignores
 * those servers entirely. Setting them looks like a fix, changes nothing, and
 * leaves you debugging the wrong layer.
 */

/** The shape `net.connect`, `undici` and `ws` all expect. */
export type LookupFunction = (
  hostname: string,
  options: LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
) => void;

/** Resolved addresses live this long. Exchange DNS is stable; this is plenty. */
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  addresses: LookupAddress[];
  expiresAt: number;
}

/**
 * Builds a `lookup` for the exchange adapters, or returns `undefined` to mean
 * "use the operating system's resolver, as normal".
 *
 * `undefined` is deliberate rather than a no-op passthrough: it is the value
 * `undici` and `ws` already treat as "use the default", so the unconfigured path
 * runs the stock code rather than ours.
 */
export function createExchangeLookup(
  servers: string[],
  logger = new Logger("ExchangeDns"),
): LookupFunction | undefined {
  if (servers.length === 0) return undefined;

  const resolver = new Resolver();
  resolver.setServers(servers);

  const cache = new Map<string, CacheEntry>();

  logger.log(
    { servers },
    "Exchange hostnames resolve through a custom DNS server",
  );

  return (hostname, options, callback) => {
    const cached = cache.get(hostname);

    if (cached && cached.expiresAt > Date.now()) {
      respond(cached.addresses);
      return;
    }

    resolve(resolver, hostname)
      .then((addresses) => {
        cache.set(hostname, {
          addresses,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        respond(addresses);
      })
      .catch((error: Error) => {
        /*
         * Fail as the OS resolver would, with the code callers already handle.
         * An exotic error shape here would be caught by nothing and surface as an
         * unhandled rejection halfway up the stack.
         */
        const err = new Error(
          `getaddrinfo ENOTFOUND ${hostname} (via ${servers.join(", ")}): ${error.message}`,
        ) as NodeJS.ErrnoException & { hostname?: string };

        err.code = "ENOTFOUND";
        err.syscall = "getaddrinfo";
        err.hostname = hostname;

        logger.warn({ hostname, err: error.message }, "DNS lookup failed");
        callback(err, []);
      });

    function respond(addresses: LookupAddress[]): void {
      if (options?.all) {
        callback(null, addresses);
        return;
      }

      const first = addresses[0];
      callback(null, first.address, first.family);
    }
  };
}

/**
 * A records, then AAAA.
 *
 * Not both: a host that answers on IPv4 is reachable, and offering an IPv6
 * address on a network with no IPv6 route buys a connection that hangs until it
 * times out rather than one that fails fast.
 */
async function resolve(
  resolver: Resolver,
  hostname: string,
): Promise<LookupAddress[]> {
  try {
    const v4 = await resolver.resolve4(hostname);
    if (v4.length > 0) {
      return v4.map((address) => ({ address, family: 4 }));
    }
  } catch {
    /* Fall through to IPv6. */
  }

  const v6 = await resolver.resolve6(hostname);
  if (v6.length === 0) {
    throw new Error("no A or AAAA record");
  }

  return v6.map((address) => ({ address, family: 6 }));
}
