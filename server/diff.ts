import { createHash } from "node:crypto";

import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { applyFileRpc, applyLinesRpc, diffRpc } from "../shared/diff";
import { readStatus, withIntentToAdd } from "./changes";
import { git } from "./git";
import { buildPatch, isRename, kindOf, parseDiff, reverse } from "./patch";

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
  renamedFrom: string | undefined;
  // What the diff covers: the file, and a renamed one's original path.
  paths: string[];
  // Whether the file isn't in the index, or is there intent-to-add.
  untracked: boolean;
  intentToAdd: boolean;
}

function versionOf(diff: Buffer): string {
  return createHash("sha256").update(diff).digest("hex");
}

// A file's own diff on the side. `git diff` leaves an untracked file out, though its changes are
// all of its lines, so it's diffed as a new file, as git diffs one added with --intent-to-add.
async function ownDiff(
  directory: string,
  path: string,
  side: Side,
  untracked: boolean,
): Promise<Buffer> {
  const diff = untracked
    ? await git(directory, "diff", ["--no-index"], ["/dev/null", path])
    : await git(directory, "diff", diffOptions[side], [path]);

  return diff;
}

// The diff of a renamed file's two paths, which shows the rename, where one of either path shows a
// deletion or a new file. An untracked file is diffed intent-to-add, as git status found the
// rename. There's no rename to diff where git status named the path a file was copied from, or
// renamed from on the other side, or where the files changed after git status paired them, so git
// no longer pairs them, or won't add a file that's gone.
async function renameDiff(
  directory: string,
  paths: readonly [string, string],
  side: Side,
  untracked: boolean,
): Promise<Buffer | undefined> {
  const diff = untracked
    ? await withIntentToAdd(directory, [paths[1]], async (index) => {
        const renamed = await git(directory, "diff", [], paths, { index });

        return renamed;
      }).catch(() => Buffer.alloc(0))
    : await git(directory, "diff", diffOptions[side], paths);

  return isRename(diff) ? diff : undefined;
}

// The file's changes on the side, as git status lists the file. A file listed twice, as deleted
// from the index and untracked, isn't renamed.
async function changesOf(directory: string, path: string, side: Side): Promise<Changes> {
  const entries = await readStatus(directory);
  const listed = entries.filter((entry) => entry.path === path);
  const original = listed[0]?.original;
  const untracked = side === "unstaged" && listed.some((entry) => entry.untracked);
  const intentToAdd = listed[0]?.intentToAdd === true;

  if (original !== undefined) {
    const renamed = await renameDiff(directory, [original, path], side, untracked);

    if (renamed !== undefined) {
      return {
        diff: renamed,
        renamedFrom: original,
        paths: [original, path],
        untracked,
        intentToAdd,
      };
    }
  }

  const diff = await ownDiff(directory, path, side, untracked);

  return { diff, renamedFrom: undefined, paths: [path], untracked, intentToAdd };
}

export async function readDiff({
  directory,
  path,
  side,
}: RpcInput<typeof diffRpc>): Promise<RpcOutput<typeof diffRpc>> {
  const { diff, renamedFrom } = await changesOf(directory, path, side);

  return {
    version: versionOf(diff),
    kind: kindOf(diff),
    renamedFrom,
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
      await git(directory, "apply", operation === "discard" ? [] : ["--cached"], [], {
        input: patch,
      });
    }
  });

  return status;
}

// Readies a file new in the worktree for `git clean`, which deletes it without ever touching a
// tracked file: brings back the file it was renamed from, and takes it out of the index if it's
// there intent-to-add.
async function readyToDelete(
  directory: string,
  path: string,
  { renamedFrom, intentToAdd }: Changes,
): Promise<void> {
  if (renamedFrom !== undefined) {
    await git(directory, "restore", [], [renamedFrom]);
  }

  if (intentToAdd) {
    await git(directory, "rm", ["--cached"], [path]);
  }
}

// Stages, unstages or discards all of the file's changes, including those a patch can't make, such
// as a binary file's or a mode change, and a rename, both of whose paths it acts on. Discarding an
// untracked file, or one intent-to-add, deletes it. A diff with no changes leaves the file alone.
export async function applyFile(action: Action): Promise<Status> {
  const { directory, path, operation } = action;

  const status = await applyInTurn(action, async (changes) => {
    const { diff, paths, untracked, intentToAdd } = changes;
    const deletes = (untracked || intentToAdd) && operation === "discard";

    if (diff.length > 0) {
      if (deletes) {
        await readyToDelete(directory, path, changes);
      }

      await git(directory, deletes ? "clean" : fileCommands[operation], [], paths);
    }
  });

  return status;
}
