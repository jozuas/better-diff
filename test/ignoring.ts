import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import * as server from "../server/ignore";
import { excludesFileRpc, ignoreRpc, patternsRpc } from "../shared/ignore";
import { runGit } from "./repository";

// The server's ignore RPCs, as Paseo calls them: with input and output as their schemas parse them.

export async function readPatterns(
  input: RpcInput<typeof patternsRpc>,
): Promise<RpcOutput<typeof patternsRpc>> {
  return patternsRpc.output.parse(await server.readPatterns(patternsRpc.input.parse(input)));
}

export async function readExcludesFile(
  input: RpcInput<typeof excludesFileRpc>,
): Promise<RpcOutput<typeof excludesFileRpc>> {
  return excludesFileRpc.output.parse(
    await server.readExcludesFile(excludesFileRpc.input.parse(input)),
  );
}

export async function ignore(
  input: RpcInput<typeof ignoreRpc>,
): Promise<RpcOutput<typeof ignoreRpc>> {
  return ignoreRpc.output.parse(await server.ignore(ignoreRpc.input.parse(input)));
}

// What git status lists: each untracked file, and each file staged, by its path.
export function status(repository: string): string[] {
  return runGit(repository, ["status", "--porcelain=v2", "--untracked-files=all", "-z"])
    .split("\0")
    .flatMap((field) => {
      if (field.startsWith("? ")) {
        return [`untracked ${field.slice(2)}`];
      }

      return field.startsWith("1 A") ? [`staged ${field.split(" ").slice(8).join(" ")}`] : [];
    })
    .toSorted();
}

export function untracked(repository: string): string[] {
  return status(repository).flatMap((listed) =>
    listed.startsWith("untracked ") ? [listed.slice("untracked ".length)] : [],
  );
}
