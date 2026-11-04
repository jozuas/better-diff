import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import { applyGroupRpc } from "../shared/diff";
import type { applyFileRpc, applyLinesRpc, applyModeRpc } from "../shared/diff";
import type { GroupName, OpenFile } from "./groups";

type Operation = RpcInput<typeof applyFileRpc>["operation"];

type Status = RpcOutput<typeof applyFileRpc>["status"];

type Selection = RpcInput<typeof applyLinesRpc>["lines"];

// A file's diff, of the version shown: all of it, or the lines.
interface ShownFile {
  file: OpenFile;
  version: string;
  lines?: Selection;
}

// A file's mode change, in its diff of the version shown.
interface ShownMode {
  file: OpenFile;
  version: string;
  mode: true;
}

// A file the sidebar lists: all of its diff, as shown if it's the file shown, or else as it is then.
interface ListedFile {
  file: OpenFile;
  shown: boolean;
}

// All of a group's files, as the sidebar lists them, or the files selected in it.
interface ListedGroup {
  group: GroupName;
  paths: readonly string[];
  // Whether they're the files selected, rather than all of the group's, so that a file joining the
  // group leaves an action on them as it is.
  selected?: true;
}

export type Target = ShownFile | ShownMode | ListedFile | ListedGroup;

// What an action asks the server, and the diff shown.
export interface Server {
  // Undefined until it's read.
  shownDiff: (file: OpenFile) => { version: string } | undefined;
  applyFile: (input: RpcInput<typeof applyFileRpc>) => Promise<{ status: Status }>;
  applyLines: (input: RpcInput<typeof applyLinesRpc>) => Promise<{ status: Status }>;
  applyMode: (input: RpcInput<typeof applyModeRpc>) => Promise<{ status: Status }>;
  applyGroup: (input: RpcInput<typeof applyGroupRpc>) => Promise<{ status: Status }>;
}

// Stale, and nothing changes, if a file has joined or left the group since it was listed, or a
// file selected has left it: an action on all of a group's files never reaches one the sidebar
// doesn't list, and one on the files selected reaches only them.
async function applyToGroup(
  server: Server,
  directory: string,
  operation: Operation,
  { group, paths, selected }: ListedGroup,
): Promise<Status> {
  const { status } = await server.applyGroup(
    applyGroupRpc.input.parse({ directory, group, operation, paths, selected }),
  );

  return status;
}

// The version of the listed file's diff as shown, if it's shown, or else null, to act on it as it
// is.
function listedVersion(server: Server, { file, shown }: ListedFile): string | null {
  return (shown ? server.shownDiff(file)?.version : undefined) ?? null;
}

async function applyToFile(
  server: Server,
  directory: string,
  operation: Operation,
  target: ShownFile | ListedFile,
): Promise<Status> {
  const action = { directory, path: target.file.path, operation };

  if ("shown" in target) {
    const { status } = await server.applyFile({
      ...action,
      version: listedVersion(server, target),
    });

    return status;
  }

  const { version, lines } = target;

  const { status } = await (lines === undefined
    ? server.applyFile({ ...action, version })
    : server.applyLines({ ...action, version, lines }));

  return status;
}

async function applyToMode(
  server: Server,
  directory: string,
  operation: Operation,
  { file, version }: ShownMode,
): Promise<Status> {
  const { status } = await server.applyMode({ directory, path: file.path, operation, version });

  return status;
}

export async function apply(
  server: Server,
  directory: string,
  operation: Operation,
  target: Target,
): Promise<Status> {
  if ("group" in target) {
    const status = await applyToGroup(server, directory, operation, target);

    return status;
  }

  const status = await ("mode" in target
    ? applyToMode(server, directory, operation, target)
    : applyToFile(server, directory, operation, target));

  return status;
}

// Why an action on the target was refused as stale.
export function staleMessage(target: Target): string {
  if (!("group" in target)) {
    return "The diff changed after it was shown, so nothing was done. It's been reloaded.";
  }

  return target.selected === undefined
    ? "The group's files changed after they were listed, so nothing was done. They've been reloaded."
    : "The selected files changed after they were selected, so nothing was done. They've been reloaded.";
}
