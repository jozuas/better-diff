import { createHash } from "node:crypto";

export function versionOf(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}
