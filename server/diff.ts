import { createHash } from "node:crypto";

import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { applyFileRpc, applyLinesRpc, diffRpc } from "../shared/diff";
import { git } from "./git";
import { buildPatch, kindOf, parseDiff, reverse } from "./patch";

type Side = RpcInput<typeof diffRpc>["side"];

type Action = RpcInput<typeof applyFileRpc>;

type Status = RpcOutput<typeof applyFileRpc>;

// The diff each operation acts on.
const sides: Record<Action["operation"], Side> = {
  stage: "unstaged",
  unstage: "staged",
  discard: "unstaged",
};

// The command that makes or undoes all of a tracked file's changes. `git reset` unstages them where
// `git restore --staged` can't, before the first commit.
const fileCommands = { stage: "add", unstage: "reset", discard: "restore" } as const;

const diffOptions: Record<Side, string[]> = { unstaged: [], staged: ["--cached"] };

interface Changes {
  diff: Buffer;
  untracked: boolean;
}

function versionOf(diff: Buffer): string {
  return createHash("sha256").update(diff).digest("hex");
}

// Not in the index, nor ignored, as `git status` lists it. A directory's path lists its files.
async function isUntracked(directory: string, path: string): Promise<boolean> {
  const listed = await git(directory, "ls-files", ["--others", "--exclude-standard"], [path]);

  return listed.equals(Buffer.from(`${path}\0`));
}

// The file's changes on the side. `git diff` leaves out an untracked file, whose unstaged changes
// are all of its lines, so it's diffed as a new file, as git diffs one added with --intent-to-add.
async function changesOf(directory: string, path: string, side: Side): Promise<Changes> {
  const untracked = side === "unstaged" && (await isUntracked(directory, path));

  const diff = untracked
    ? await git(directory, "diff", ["--no-index"], ["/dev/null", path])
    : await git(directory, "diff", diffOptions[side], [path]);

  return { diff, untracked };
}

export async function readDiff({
  directory,
  path,
  side,
}: RpcInput<typeof diffRpc>): Promise<RpcOutput<typeof diffRpc>> {
  const { diff } = await changesOf(directory, path, side);

  return {
    version: versionOf(diff),
    kind: kindOf(diff),
    hunks: parseDiff(diff).hunks.map(({ oldStart, newStart, lines }) => ({
      oldStart,
      newStart,
      lines: lines.map(({ kind, content, newline }) => ({
        kind,
        text: content.toString("utf8"),
        newline,
      })),
    })),
  };
}

// The last apply to start.
let applying: Promise<unknown> = Promise.resolve();

// Once the previous apply has finished, acts on the diff the operation acts on, if it is still the
// one the action was chosen from.
async function applyAfter(
  previous: Promise<unknown>,
  { directory, path, operation, version }: Action,
  act: (changes: Changes) => Promise<void>,
): Promise<Status> {
  await Promise.allSettled([previous]);

  const changes = await changesOf(directory, path, sides[operation]);

  if (versionOf(changes.diff) !== version) {
    return { status: "stale" };
  }

  await act(changes);

  return { status: "applied" };
}

// One apply at a time. Two at once could both find the diff unchanged, and the second would then
// apply to what the first left, where `git apply` can find a patch's lines in another place.
async function applyInTurn(
  action: Action,
  act: (changes: Changes) => Promise<void>,
): Promise<Status> {
  const applied = applyAfter(applying, action, act);

  applying = applied;

  const status = await applied;

  return status;
}

// Stages, unstages or discards the selected lines' changes.
export async function applyLines({
  lines,
  ...action
}: RpcInput<typeof applyLinesRpc>): Promise<Status> {
  const { directory, operation } = action;

  const status = await applyInTurn(action, async ({ diff }) => {
    const parsed = parseDiff(diff);

    for (const { hunk, line } of lines) {
      if (parsed.hunks[hunk]?.lines[line] === undefined) {
        throw new Error(`The diff has no line ${line} in hunk ${hunk}.`);
      }
    }

    const selected = new Set(lines.map(({ hunk, line }) => `${hunk}:${line}`));

    const patch = buildPatch(operation === "stage" ? parsed : reverse(parsed), (hunk, line) =>
      selected.has(`${hunk}:${line}`),
    );

    if (patch.length > 0) {
      await git(directory, "apply", operation === "discard" ? [] : ["--cached"], [], patch);
    }
  });

  return status;
}

// Stages, unstages or discards all of the file's changes, including those a patch can't make, such
// as a binary file's or a mode change. Discarding an untracked file deletes it, which `git clean`
// does without ever touching a tracked one. A diff with no changes leaves the file alone.
export async function applyFile(action: Action): Promise<Status> {
  const { directory, path, operation } = action;

  const status = await applyInTurn(action, async ({ diff, untracked }) => {
    const command = untracked && operation === "discard" ? "clean" : fileCommands[operation];

    if (diff.length > 0) {
      await git(directory, command, [], [path]);
    }
  });

  return status;
}
