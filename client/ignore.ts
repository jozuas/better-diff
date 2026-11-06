import type { RpcInput } from "@getpaseo/plugin";

import type { ignoreRpc } from "../shared/ignore";

export type Place = RpcInput<typeof ignoreRpc>["place"];

// Where an untracked file's menu has a rule ignoring it go, as Magit's gitignore menu has them: the
// root's .gitignore, a subdirectory's, picked next, the clone's own excludes, or core.excludesFile's.
export type IgnorePlace = "root" | "subdirectory" | "private" | "global";

export interface IgnoreItem {
  place: IgnorePlace;
  label: string;
  disabled: boolean;
}

// The directories the file at the path is in, but the root, from its own outwards. The path of a
// repository inside the repository ends in `/`.
export function directoriesOf(path: string): string[] {
  const names = path.split("/").slice(0, path.endsWith("/") ? -2 : -1);

  return names.map((_, index) => names.slice(0, names.length - index).join("/"));
}

// What core.excludesFile is as read: undefined until it is, null while it isn't set.
function globalLabel(excludesFile?: string | null): string {
  if (excludesFile === undefined) {
    return "Ignore in all repositories";
  }

  return `Ignore in all repositories (${excludesFile ?? "core.excludesFile isn't set"})`;
}

// The menu's items for the places a rule ignoring the file at the path can go: a subdirectory's
// only for a file in one, and all repositories' only once core.excludesFile is read and set.
export function ignoreItems(path: string, excludesFile?: string | null): IgnoreItem[] {
  const items: IgnoreItem[] = [
    { place: "root", label: "Ignore in .gitignore", disabled: false },
    { place: "subdirectory", label: "Ignore in a subdirectory's .gitignore", disabled: false },
    { place: "private", label: "Ignore privately (.git/info/exclude)", disabled: false },
    {
      place: "global",
      label: globalLabel(excludesFile),
      disabled: excludesFile === undefined || excludesFile === null,
    },
  ];

  return directoriesOf(path).length === 0
    ? items.filter(({ place }) => place !== "subdirectory")
    : items;
}

// Where the rule goes, as the server takes it, once a subdirectory's is picked. Candidates for a
// rule anywhere but a subdirectory's .gitignore are from the root, as in Magit.
export function placeOf(place: Exclude<IgnorePlace, "subdirectory">): Place {
  return place === "root" ? { kind: "shared", inDirectory: "" } : { kind: place };
}

// The directory the place's candidates are from: a subdirectory's for its .gitignore, and else the
// root.
export function candidatesIn(place: Place): string {
  return place.kind === "shared" ? place.inDirectory : "";
}

// The file the rule goes in, as the prompt names it.
export function fileOfPlace(place: Place, excludesFile?: string | null): string {
  if (place.kind === "private") {
    return ".git/info/exclude";
  }

  if (place.kind === "global") {
    return excludesFile ?? "core.excludesFile";
  }

  return place.inDirectory === "" ? ".gitignore" : `${place.inDirectory}/.gitignore`;
}

// How many candidates show at most.
const mostShown = 100;

// The candidates that have what's typed in them, as many as show, and how many more there are.
interface ShownPatterns {
  shown: string[];
  more: number;
}

export function shownPatterns(patterns: readonly string[], typed: string): ShownPatterns {
  const matching = patterns.filter((pattern) => pattern.includes(typed));

  return { shown: matching.slice(0, mostShown), more: Math.max(matching.length - mostShown, 0) };
}

// The rule Enter adds, and what the field shows until something's typed: the default, once the
// candidates are read, if there is one.
interface Field {
  rule: string | undefined;
  placeholder: string;
}

// What's typed goes in as it is, or with nothing typed, the default.
export function fieldOf(typed: string, read?: { default: string | null }): Field {
  const defaultRule = read?.default ?? undefined;

  return { rule: typed === "" ? defaultRule : typed, placeholder: defaultRule ?? "" };
}
