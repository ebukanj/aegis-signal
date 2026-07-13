"use client";

import { Children, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Vertical row stack with a fast, subtle entrance stagger.
 * Each direct child is one row; rows lay out their own columns.
 * Respects prefers-reduced-motion.
 */
export function StaggeredRows({ children }: { children: ReactNode }) {
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
