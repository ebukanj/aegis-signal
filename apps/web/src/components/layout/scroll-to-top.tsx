"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Every navigation lands at the top of the page.
 *
 * The app shell scrolls inside `<main>` (the sidebar stays fixed), so the
 * browser's default scroll restoration never sees it — navigate from the bottom
 * of the Signals feed to Insights and you would arrive mid-page. This resets
 * both the window and the workspace scroll container on every route change —
 * the owner's requirement: a page always loads from the top.
 */
export function ScrollToTop() {
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.getElementById("main-content")?.scrollTo({ top: 0 });
  }, [pathname]);

  return null;
}
