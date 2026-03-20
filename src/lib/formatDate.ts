// src/lib/formatDate.ts
// Shared date formatting to ensure consistency across the app.

/**
 * Format a date string using Intl.DateTimeFormat.
 *
 * @param dateStr - ISO date string
 * @param style - 'short' (3/20/26), 'medium' (Mar 20, 2026), or 'long' (March 20, 2026)
 */
export function formatDate(
  dateStr: string,
  style: "short" | "medium" | "long" = "medium",
): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: style }).format(
    new Date(dateStr),
  );
}

/**
 * Format a date string with weekday for invite/challenge views.
 * Example: "Fri, Mar 20"
 */
export function formatDateWithWeekday(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(dateStr));
}
