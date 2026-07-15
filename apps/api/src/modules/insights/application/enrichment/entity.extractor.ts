import { Injectable } from "@nestjs/common";
import type { InsightEntity } from "@aegis/contracts";

/**
 * Who is this story about?
 *
 * ── A dictionary, not a model ──
 *
 * Entity extraction here is a deterministic dictionary match, not named-entity
 * recognition by a language model. That is a deliberate limitation and the right
 * one: the platform needs to know when a story concerns BTC or Binance or an
 * unlock on ARB, and it needs that answer to be the SAME every time and checkable
 * by a human. A model that decides "this mentions Solana" with 84% confidence is
 * exactly the kind of unauditable guess this engine refuses to make.
 *
 * The cost is recall — a coin not in the dictionary is not seen. That is
 * acceptable: the dictionary covers the assets the platform actually trades, and a
 * missing match fails SAFE (the story is market-wide rather than mis-attributed to
 * the wrong coin). Adding an asset is one line.
 */
@Injectable()
export class EntityExtractor {
  extract(text: string): InsightEntity[] {
    const haystack = ` ${text.toLowerCase()} `;
    const found = new Map<string, InsightEntity>();

    for (const entity of DICTIONARY) {
      for (const alias of entity.aliases) {
        /*
         * Word-boundary match on a padded, lowercased haystack. "eth" must not fire
         * on "ethos" or "together"; a ticker is matched as a whole word only. This
         * is the difference between "the story is about ETH" and "the story happens
         * to contain those three letters".
         */
        if (matchesWord(haystack, alias)) {
          found.set(entity.symbol, {
            kind: entity.kind,
            symbol: entity.symbol,
            name: entity.name,
          });
          break;
        }
      }
    }

    return [...found.values()];
  }

  /** The coin symbols among the entities — what the veto and filters key on. */
  coins(entities: readonly InsightEntity[]): string[] {
    return entities
      .filter((e) => e.kind === "COIN" || e.kind === "STABLECOIN")
      .map((e) => e.symbol);
  }
}

function matchesWord(paddedLowerHaystack: string, aliasLower: string): boolean {
  /* Aliases with spaces (e.g. "binance us") are substring-matched with padding;
   * single tokens get strict word boundaries. */
  const needle = ` ${aliasLower} `;
  if (paddedLowerHaystack.includes(needle)) return true;

  /* Also allow trailing punctuation: "ETH," / "ETH." / "ETH:" */
  const re = new RegExp(`[\\s([]${escapeRegex(aliasLower)}[\\s)\\].,:;!?'"]`);
  return re.test(paddedLowerHaystack);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ── The dictionary ────────────────────────────────────────────────── */

interface DictEntry {
  kind: InsightEntity["kind"];
  symbol: string;
  name: string;
  aliases: string[];
}

/**
 * The assets, exchanges and infrastructure the platform recognises. Aliases are
 * lowercased; the ticker and the full name are both included so "Bitcoin" and
 * "BTC" both resolve. Kept deliberately curated — precision over recall.
 */
const DICTIONARY: DictEntry[] = [
  // Majors
  { kind: "COIN", symbol: "BTC", name: "Bitcoin", aliases: ["btc", "bitcoin", "xbt"] },
  { kind: "COIN", symbol: "ETH", name: "Ethereum", aliases: ["eth", "ethereum", "ether"] },
  { kind: "COIN", symbol: "SOL", name: "Solana", aliases: ["sol", "solana"] },
  { kind: "COIN", symbol: "BNB", name: "BNB", aliases: ["bnb"] },
  { kind: "COIN", symbol: "XRP", name: "XRP", aliases: ["xrp", "ripple"] },
  { kind: "COIN", symbol: "ADA", name: "Cardano", aliases: ["ada", "cardano"] },
  { kind: "COIN", symbol: "DOGE", name: "Dogecoin", aliases: ["doge", "dogecoin"] },
  { kind: "COIN", symbol: "AVAX", name: "Avalanche", aliases: ["avax", "avalanche"] },
  { kind: "COIN", symbol: "LINK", name: "Chainlink", aliases: ["link", "chainlink"] },
  { kind: "COIN", symbol: "DOT", name: "Polkadot", aliases: ["dot", "polkadot"] },
  { kind: "COIN", symbol: "MATIC", name: "Polygon", aliases: ["matic", "polygon"] },
  { kind: "COIN", symbol: "ARB", name: "Arbitrum", aliases: ["arb", "arbitrum"] },
  { kind: "COIN", symbol: "OP", name: "Optimism", aliases: ["optimism", "$op"] },
  { kind: "COIN", symbol: "SUI", name: "Sui", aliases: ["sui"] },
  { kind: "COIN", symbol: "APT", name: "Aptos", aliases: ["apt", "aptos"] },
  { kind: "COIN", symbol: "TON", name: "Toncoin", aliases: ["toncoin", "ton network"] },
  { kind: "COIN", symbol: "LTC", name: "Litecoin", aliases: ["ltc", "litecoin"] },
  { kind: "COIN", symbol: "SHIB", name: "Shiba Inu", aliases: ["shib", "shiba inu"] },
  { kind: "COIN", symbol: "PEPE", name: "Pepe", aliases: ["pepe"] },
  { kind: "COIN", symbol: "UNI", name: "Uniswap", aliases: ["uni", "uniswap"] },
  { kind: "COIN", symbol: "AAVE", name: "Aave", aliases: ["aave"] },

  // Stablecoins
  { kind: "STABLECOIN", symbol: "USDT", name: "Tether", aliases: ["usdt", "tether"] },
  { kind: "STABLECOIN", symbol: "USDC", name: "USD Coin", aliases: ["usdc", "usd coin", "circle"] },
  { kind: "STABLECOIN", symbol: "DAI", name: "Dai", aliases: ["dai"] },

  // Exchanges
  { kind: "EXCHANGE", symbol: "BINANCE", name: "Binance", aliases: ["binance"] },
  { kind: "EXCHANGE", symbol: "COINBASE", name: "Coinbase", aliases: ["coinbase"] },
  { kind: "EXCHANGE", symbol: "BYBIT", name: "Bybit", aliases: ["bybit"] },
  { kind: "EXCHANGE", symbol: "OKX", name: "OKX", aliases: ["okx"] },
  { kind: "EXCHANGE", symbol: "KRAKEN", name: "Kraken", aliases: ["kraken"] },
  { kind: "EXCHANGE", symbol: "KUCOIN", name: "KuCoin", aliases: ["kucoin"] },
  { kind: "EXCHANGE", symbol: "BITGET", name: "Bitget", aliases: ["bitget"] },

  // Chains / infrastructure
  { kind: "CHAIN", symbol: "BASE", name: "Base", aliases: ["base chain", "base network"] },
  { kind: "PROTOCOL", symbol: "LIDO", name: "Lido", aliases: ["lido"] },
  { kind: "PROTOCOL", symbol: "MAKER", name: "MakerDAO", aliases: ["makerdao", "maker dao"] },
  { kind: "PROTOCOL", symbol: "CURVE", name: "Curve", aliases: ["curve finance"] },

  // Sectors (matched only by explicit phrases)
  { kind: "SECTOR", symbol: "DEFI", name: "DeFi", aliases: ["defi", "decentralized finance"] },
  { kind: "SECTOR", symbol: "NFT", name: "NFTs", aliases: ["nft", "nfts"] },
  { kind: "SECTOR", symbol: "RWA", name: "Real-World Assets", aliases: ["rwa", "real-world asset"] },
];
