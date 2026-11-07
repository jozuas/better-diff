import type { Page } from "@playwright/test";
import { z } from "zod";

// A message between the page and the daemon, as the schema reads it, if it does. Text that isn't
// JSON doesn't.
export function read<Message>(
  schema: z.ZodType<Message>,
  message: string | Buffer,
): Message | undefined {
  const text = z.string().safeParse(message);

  if (!text.success) {
    return undefined;
  }

  try {
    return schema.safeParse(JSON.parse(text.data)).data;
  } catch {
    return undefined;
  }
}

// What lets messages held back reach the daemon, and how many were.
export interface Held {
  release: () => void;
  held: () => number;
}

// Keeps the page's messages to the daemon that the schema reads from reaching it until they're
// released, and lets the others through, and those after they're released.
export async function hold(page: Page, schema: z.ZodType): Promise<Held> {
  const held: (() => void)[] = [];
  let count = 0;
  let released = false;

  await page.routeWebSocket(/./u, (socket) => {
    const server = socket.connectToServer();

    socket.onMessage((message) => {
      if (!released && read(schema, message) !== undefined) {
        count += 1;
        held.push(() => {
          server.send(message);
        });
      } else {
        server.send(message);
      }
    });
  });

  return {
    release: () => {
      released = true;

      for (const send of held.splice(0)) {
        send();
      }
    },
    held: () => count,
  };
}
