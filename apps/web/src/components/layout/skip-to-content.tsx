/**
 * Skip navigation.
 *
 * Without this, a keyboard or screen-reader user must tab through the entire
 * sidebar — every workspace link, every section — before they can reach the
 * signal they came here to read. On every single page load.
 *
 * It is invisible until focused, which is why nobody who does not need it will
 * ever see it, and why everyone who does need it will find it immediately
 * (WCAG 2.4.1).
 */
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
    >
      Skip to content
    </a>
  );
}
