"use client";

import { Children, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Dashboard row stack with a fast, subtle entrance stagger.
 * Each direct child is one dashboard row; rows lay out their own columns
 * with a 12-column grid. Respects prefers-reduced-motion.
 */
export function DashboardGrid({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();

  return (
    <div className="flex flex-col gap-4">
      {Children.map(children, (child, index) => (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: index * 0.04, ease: "easeOut" }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
