import { appendFileSync } from "node:fs";
import { join } from "node:path";

import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import type {
  ProviderConnection,
  ProviderEvent,
  ProviderInput,
} from "@getpaseo/plugin/server/provider";

// The environment variable that names the file an agent notes what it's sent in.
export const promptsVariable = "BETTER_DIFF_PROMPTS";

// The file in the git directory of the repository an agent works in where it notes what it's sent,
// if it's started without the variable, as one Better Diff starts is.
export const startedPrompts = "better-diff-test-agent.jsonl";

// What an agent's asked to take a turn that doesn't end, as an agent at work is taking, rather than
// one that ends at once.
export const workPrompt = "Work";

// What an agent's asked to take a turn that doesn't end, waiting for permission to run a command.
export const askPrompt = "Ask";

// What an agent's asked to take a turn that fails at once.
export const failPrompt = "Fail";

type Emit = (event: ProviderEvent) => void;

type Input<Type extends ProviderInput["type"]> = Extract<ProviderInput, { type: Type }>;

// What's known of each open session, by its ID: where it notes what it's sent, and the turn it's
// taking while it's at work.
interface Sessions {
  notes: Map<string, string>;
  working: Map<string, string>;
}

const capabilities = ["prompt.message", "prompt.steer", "permission"];

let turns = 0;

function open(input: Input<"session.open">, emit: Emit, { notes }: Sessions): void {
  notes.set(
    input.sessionId,
    input.config.env[promptsVariable] ?? join(input.config.cwd, ".git", startedPrompts),
  );
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

// Whether the prompt says the text, as asking for a turn of another kind does.
function says({ input }: Input<"session.prompt">["prompt"], text: string): boolean {
  return (
    input.type === "message" &&
    input.content.some((part) => part.type === "text" && part.text === text)
  );
}

// Notes what the prompt says, as a line of JSON, in the session's file, if it has one.
function note({ sessionId, prompt: sent }: Input<"session.prompt">, { notes }: Sessions): void {
  const file = notes.get(sessionId);

  if (file !== undefined) {
    appendFileSync(file, `${JSON.stringify(sent.input)}\n`);
  }
}

// The turn the session's at work on, if the prompt's steered into it.
function steeredInto(
  { sessionId, prompt: sent }: Input<"session.prompt">,
  { working }: Sessions,
): string | undefined {
  return sent.delivery === "steer" ? working.get(sessionId) : undefined;
}

// How a turn goes on once it's started, by what its prompt asked for: it fails at once, waits for
// permission to run a command, works without end, or else ends at once. Gives whether the session's
// then at work on the turn.
type Turn = (sessionId: string, turnId: string, emit: Emit) => boolean;

function fail(sessionId: string, turnId: string, emit: Emit): boolean {
  emit({ type: "session.turn", sessionId, turnId, state: "failed", error: { message: "Failed." } });

  return false;
}

function ask(sessionId: string, turnId: string, emit: Emit): boolean {
  emit({
    type: "session.permission",
    sessionId,
    request: { id: `${turnId} permission`, name: "Bash", kind: "tool", title: "Run a command" },
  });

  return true;
}

function work(): boolean {
  return true;
}

function end(sessionId: string, turnId: string, emit: Emit): boolean {
  emit({
    type: "timeline.item",
    sessionId,
    item: { type: "assistant_message", id: `${turnId} reply`, text: "Read." },
  });
  emit({ type: "session.turn", sessionId, turnId, state: "completed" });

  return false;
}

const turnsAsked: readonly (readonly [string, Turn])[] = [
  [failPrompt, fail],
  [askPrompt, ask],
  [workPrompt, work],
];

function turnOf(sent: Input<"session.prompt">["prompt"]): Turn {
  return turnsAsked.find(([text]) => says(sent, text))?.[1] ?? end;
}

// Notes what the prompt says. Takes it into the turn the session's at work on, if it's steered
// there, and else starts a turn, which goes on as the prompt asks.
function prompt(input: Input<"session.prompt">, emit: Emit, sessions: Sessions) {
  const { sessionId, prompt: sent } = input;
  const steered = steeredInto(input, sessions);

  note(input, sessions);

  if (steered !== undefined) {
    emit({
      type: "session.prompt_result",
      sessionId,
      clientMessageId: sent.clientMessageId,
      result: { type: "steer", turnId: steered },
    });

    return;
  }

  const turnId = `turn ${String((turns += 1))}`;

  emit({
    type: "session.prompt_result",
    sessionId,
    clientMessageId: sent.clientMessageId,
    result: { type: "turn", turnId },
  });
  emit({ type: "session.turn", sessionId, turnId, state: "started" });

  if (turnOf(sent)(sessionId, turnId, emit)) {
    sessions.working.set(sessionId, turnId);
  }
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

function answer(input: ProviderInput, emit: Emit, sessions: Sessions): void {
  if (input.type === "session.open") {
    open(input, emit, sessions);
  } else if (input.type === "session.prompt") {
    prompt(input, emit, sessions);
  } else {
    reply(input, emit);
  }
}

function connect(): ProviderConnection {
  const listeners = new Set<Emit>();
  const sessions: Sessions = { notes: new Map(), working: new Map() };

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
      answer(input, emit, sessions);
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
