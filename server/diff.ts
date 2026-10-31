import { createHash } from "node:crypto";

import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { applyRpc, diffRpc } from "../shared/diff";
import { git } from "./git";
import { buildPatch, parseDiff, reverse } from "./patch";

type Side = RpcInput<typeof diffRpc>["side"];

type Operation = RpcInput<typeof applyRpc>["operation"];

// The diff each operation acts on.
const sides: Record<Operation, Side> = {
  stage: "unstaged",
  unstage: "staged",
  discard: "unstaged",
};

const diffOptions: Record<Side, string[]> = { unstaged: [], staged: ["--cached"] };

function versionOf(diff: Buffer): string {
  return createHash("sha256").update(diff).digest("hex");
}

export async function readDiff({
  directory,
  path,
  side,
}: RpcInput<typeof diffRpc>): Promise<RpcOutput<typeof diffRpc>> {
  const diff = await git(directory, "diff", diffOptions[side], [path]);

  return {
    version: versionOf(diff),
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

// Stages, unstages or discards the selected lines' changes, if the diff they were chosen from is
// still the file's diff.
async function apply({
  directory,
  path,
  operation,
  version,
  lines,
}: RpcInput<typeof applyRpc>): Promise<RpcOutput<typeof applyRpc>> {
  const diff = await git(directory, "diff", diffOptions[sides[operation]], [path]);

  if (versionOf(diff) !== version) {
    throw new Error("The diff has changed since it was read.");
  }

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

  return {};
}

// The last apply to start.
let applying: Promise<unknown> = Promise.resolve();

async function applyAfter(
  previous: Promise<unknown>,
  input: RpcInput<typeof applyRpc>,
): Promise<RpcOutput<typeof applyRpc>> {
  await Promise.allSettled([previous]);

  return apply(input);
}

// One apply at a time. Two at once could both find the diff unchanged, and the second patch would
// then apply to what the first left, where `git apply` can find its lines in another place.
export async function applyLines(
  input: RpcInput<typeof applyRpc>,
): Promise<RpcOutput<typeof applyRpc>> {
  const applied = applyAfter(applying, input);

  applying = applied;

  const output = await applied;

  return output;
}
