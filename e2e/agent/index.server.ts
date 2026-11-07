import { appendFileSync } from "node:fs";

import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import type {
  ProviderConnection,
  ProviderEvent,
  ProviderInput,
} from "@getpaseo/plugin/server/provider";

// The environment variable that names the file an agent notes what it's sent in.
export const promptsVariable = "BETTER_DIFF_PROMPTS";

type Emit = (event: ProviderEvent) => void;

type Input<Type extends ProviderInput["type"]> = Extract<ProviderInput, { type: Type }>;

// Where each open session notes what it's sent, by the session's ID.
type Notes = Map<string, string | undefined>;

const capabilities = ["prompt.message", "prompt.steer"];

let turns = 0;

function open(input: Input<"session.open">, emit: Emit, notes: Notes): void {
  notes.set(input.sessionId, input.config.env[promptsVariable]);
  emit({
    type: "session.opened",
    requestId: input.requestId,
    sessionId: input.sessionId,
    cwd: input.config.cwd,
    restoration: "core",
    capabilities,
  });
  emit({ type: "session.ready", requestId: input.requestId, sessionId: input.sessionId });
}

// Notes what the prompt says, as a line of JSON, and ends its turn at once.
function prompt({ sessionId, prompt: sent }: Input<"session.prompt">, emit: Emit, notes: Notes) {
  const turnId = `turn ${String((turns += 1))}`;
  const file = notes.get(sessionId);

  if (file !== undefined) {
    appendFileSync(file, `${JSON.stringify(sent.input)}\n`);
  }

  emit({
    type: "session.prompt_result",
    sessionId,
    clientMessageId: sent.clientMessageId,
    result: { type: "turn", turnId },
  });
  emit({ type: "session.turn", sessionId, turnId, state: "started" });
  emit({
    type: "timeline.item",
    sessionId,
    item: { type: "assistant_message", id: `${turnId} reply`, text: "Read." },
  });
  emit({ type: "session.turn", sessionId, turnId, state: "completed" });
}

// What a request that isn't for a session to open or a prompt is answered with, by its type: no
// sessions to import, a model that does nothing, or else that it's done.
const replies: Partial<Record<ProviderInput["type"], (requestId: string) => ProviderEvent>> = {
  catalog: (requestId) => ({
    type: "catalog",
    requestId,
    catalog: { models: [{ id: "notes", label: "Notes", isDefault: true }], modes: [] },
  }),
  sessions: (requestId) => ({ type: "sessions", requestId, sessions: [] }),
};

function completed(requestId: string): ProviderEvent {
  return { type: "request.completed", requestId };
}

function reply(input: ProviderInput, emit: Emit): void {
  if ("requestId" in input) {
    emit((replies[input.type] ?? completed)(input.requestId));
  }
}

function answer(input: ProviderInput, emit: Emit, notes: Notes): void {
  if (input.type === "session.open") {
    open(input, emit, notes);
  } else if (input.type === "session.prompt") {
    prompt(input, emit, notes);
  } else {
    reply(input, emit);
  }
}

function connect(): ProviderConnection {
  const listeners = new Set<Emit>();
  const notes: Notes = new Map();

  function emit(event: ProviderEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  return {
    version: 1,
    capabilities,
    send: async (input) => {
      await Promise.resolve();
      answer(input, emit, notes);
    },
    onEvent: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    close: async () => {
      listeners.clear();
      await Promise.resolve();
    },
  };
}

// A provider for the end-to-end tests, whose agents only note what they're sent, so that a test can
// read what an agent got.
export default function contribute(server: PluginServerContext): PluginCleanup {
  server.registerProvider({
    id: "better-diff-test-agent",
    label: "Test agent",
    status: async () => {
      await Promise.resolve();

      return { available: true };
    },
    connect: async () => {
      await Promise.resolve();

      return connect();
    },
  });

  return () => {};
}
