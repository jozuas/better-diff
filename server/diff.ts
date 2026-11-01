import { createHash } from "node:crypto";

import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { applyFileRpc, applyLinesRpc, diffRpc } from "../shared/diff";
import { readStatus, withIntentToAdd } from "./changes";
import type { Entry } from "./changes";
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

export interface Changes {
  diff: Buffer;
  renamedFrom: string | undefined;
  // What the diff covers: the file, and a renamed one's original path.
  paths: string[];
  // Whether the file isn't in the index, or is there intent-to-add.
  untracked: boolean;
  intentToAdd: boolean;
}

export function versionOf(diff: Buffer): string {
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

// The file's changes on the side, as git status lists it in the entries. A file listed twice, as
// deleted from the index and untracked, isn't renamed.
export async function changesIn(
  directory: string,
  entries: readonly Entry[],
  path: string,
  side: Side,
): Promise<Changes> {
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

async function changesOf(directory: string, path: string, side: Side): Promise<Changes> {
  const entries = await readStatus(directory);
  const changes = await changesIn(directory, entries, path, side);

  return changes;
}

function text(content: Buffer): string {
  return content.toString("utf8");
}

// The diff of the changes, as the plugin shows it.
export function diffOf({ diff, renamedFrom }: Changes): RpcOutput<typeof diffRpc> {
  const { hunks, lines } = parseDiff(diff);

  return {
    version: versionOf(diff),
    kind: kindOf(diff),
    renamedFrom,
    hunks: hunks.map(({ oldStart, newStart, lines: hunkLines }) => ({
      oldStart,
      newStart,
      lines: hunkLines.map(({ kind, content, newline }) => ({
        kind,
        text: text(content),
        newline,
      })),
    })),
    contents: {
      old: lines.flatMap(({ kind, content }) => (kind === "added" ? [] : [text(content)])),
      new: lines.flatMap(({ kind, content }) => (kind === "removed" ? [] : [text(content)])),
    },
  };
}

export async function readDiff({
  directory,
  path,
  side,
}: RpcInput<typeof diffRpc>): Promise<RpcOutput<typeof diffRpc>> {
  const changes = await changesOf(directory, path, side);

  return diffOf(changes);
}

// The last apply to start.
let applying: Promise<unknown> = Promise.resolve();

async function after(previous: Promise<unknown>, apply: () => Promise<Status>): Promise<Status> {
  await Promise.allSettled([previous]);

  const status = await apply();

  return status;
}

// Applies once the previous apply has finished. Two at once could both find the diff unchanged,
// and the second would then apply to what the first left, where `git apply` can find a patch's
// lines in another place.
export async function inTurn(apply: () => Promise<Status>): Promise<Status> {
  const applied = after(applying, apply);

  applying = applied;

  const status = await applied;

  return status;
}

// In turn, acts on the diff the operation acts on, if it is still the one the action was chosen
// from.
async function applyToFile(
  { directory, path, operation, version }: Action,
  act: (changes: Changes) => Promise<void>,
): Promise<Status> {
  const status = await inTurn(async () => {
    const changes = await changesOf(directory, path, sides[operation]);

    if (versionOf(changes.diff) !== version) {
      return { status: "stale" };
    }

    await act(changes);

    return { status: "applied" };
  });

  return status;
}

// Stages, unstages or discards the selected lines' changes.
export async function applyLines({
  lines,
  ...action
}: RpcInput<typeof applyLinesRpc>): Promise<Status> {
  const { directory, operation } = action;

  const status = await applyToFile(action, async ({ diff }) => {
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

// A file, and its changes on the side an operation acts on.
export interface ChangedFile {
  path: string;
  changes: Changes;
}

// Whether the operation deletes the file: discarding a file new in the worktree, untracked or
// intent-to-add, deletes it.
function deletes(operation: Action["operation"], { untracked, intentToAdd }: Changes): boolean {
  return operation === "discard" && (untracked || intentToAdd);
}

// Runs the command on the paths, if there are any: with none, `git clean` and `git reset` act on
// every file.
async function gitOn(
  directory: string,
  command: "restore" | "rm" | "add" | "reset" | "clean",
  paths: readonly string[],
  options: readonly string[] = [],
): Promise<void> {
  if (paths.length > 0) {
    await git(directory, command, options, paths);
  }
}

// Stages, unstages or discards all of the files' changes, including those a patch can't make, such
// as a binary file's or a mode change, and a rename, both of whose paths it acts on. A file whose
// diff has no changes is left alone. A file discarding deletes goes with `git clean`, which never
// touches a tracked file, once the file it was renamed from is back and it's out of the index.
// Each command runs once, for all the files it acts on.
export async function applyChanges(
  directory: string,
  operation: Action["operation"],
  files: readonly ChangedFile[],
): Promise<void> {
  const changed = files.flatMap(({ path, changes }) =>
    changes.diff.length > 0 ? [{ path, ...changes }] : [],
  );

  const deleted = changed.filter((file) => deletes(operation, file));
  const kept = changed.filter((file) => !deletes(operation, file));

  await gitOn(
    directory,
    "restore",
    deleted.flatMap(({ renamedFrom }) => renamedFrom ?? []),
  );
  await gitOn(
    directory,
    "rm",
    deleted.flatMap(({ path, intentToAdd }) => (intentToAdd ? [path] : [])),
    ["--cached"],
  );
  await gitOn(
    directory,
    fileCommands[operation],
    kept.flatMap(({ paths }) => paths),
  );
  await gitOn(
    directory,
    "clean",
    deleted.flatMap(({ paths }) => paths),
  );
}

export async function applyFile(action: Action): Promise<Status> {
  const { directory, path, operation } = action;

  const status = await applyToFile(action, async (changes) => {
    await applyChanges(directory, operation, [{ path, changes }]);
  });

  return status;
}
