// src/lib/formatters.ts
// Shared formatting utilities

// Re-export time formatting from the canonical source
// NOTE: formatTimeAgo is the single source of truth in serverTime.ts
// This re-export maintains backwards compatibility for existing imports
export { formatTimeAgo } from "./serverTime";

/**
 * Format a number with commas (e.g., 1234567 -> "1,234,567")
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Format a date as a short date string (e.g., "Jan 15")
 */
export function formatShortDate(dateString: string): string {
  // Date-only strings ("YYYY-MM-DD") parse as UTC midnight; adding noon
  // prevents timezone offsets from shifting the displayed date.
  const normalized = dateString.length === 10 ? `${dateString}T12:00:00` : dateString;
  const date = new Date(normalized);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
