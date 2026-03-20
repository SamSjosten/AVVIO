// src/lib/extractErrorMessage.ts
// Type-safe error message extraction for catch (err: unknown) blocks

/**
 * Extract a user-facing message from an unknown caught value.
 * Replaces the unsafe `(err: any) => err.message` pattern.
 */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "An unexpected error occurred";
}
