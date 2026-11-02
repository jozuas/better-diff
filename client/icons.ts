import type { PluginSvgIcon } from "@getpaseo/plugin";

// Sublime Merge's icons for the toggle on a hunk's bar, which Paseo draws in the icon's colour, on a
// grid of 15 pixels.

// Triangles pointing out from a line, in a dotted frame: the entire file, around the hunks.
export const entireFileIcon: PluginSvgIcon = {
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 15" fill="currentColor" stroke="currentColor"><path d="M1 1.5h13M1 13.5h13M1.5 3v9M13.5 3v9" fill="none" stroke-dasharray="1 1"/><path d="M1 7.5h13" fill="none"/><path d="M4.5 6h6l-3-3zM4.5 9h6l-3 3z" stroke="none"/></svg>',
};

// Triangles pointing in to a line, in a solid frame: only the hunks.
export const onlyHunksIcon: PluginSvgIcon = {
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 15" fill="currentColor" stroke="currentColor"><rect x="1.5" y="1.5" width="12" height="12" rx="1.5" fill="none"/><path d="M2 7.5h11" fill="none"/><path d="M4.5 3h6l-3 3zM4.5 12h6l-3-3z" stroke="none"/></svg>',
};
