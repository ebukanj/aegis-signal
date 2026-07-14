import { z } from "zod";

/**
 * Pagination.
 *
 * The signal ledger only ever grows and is never deleted (06-STRATEGIES §5), so
 * every list endpoint over it must be paginated from day one. An endpoint that
 * returns "all signals" is fine for a week and a catastrophe by month three.
 *
 * The cap is not negotiable: a client asking for 10,000 rows is a client asking
 * to take the database down.
 */

export const MAX_PAGE_SIZE = 100;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
});

export type Pagination = z.infer<typeof paginationSchema>;

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

/** Prisma's `skip`/`take` from a validated page request. */
export function toPrisma(pagination: Pagination): {
  skip: number;
  take: number;
} {
  return {
    skip: (pagination.page - 1) * pagination.pageSize,
    take: pagination.pageSize,
  };
}

export function toPage<T>(
  items: T[],
  total: number,
  pagination: Pagination,
): Page<T> {
  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));

  return {
    items,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages,
    hasNext: pagination.page < totalPages,
  };
}
