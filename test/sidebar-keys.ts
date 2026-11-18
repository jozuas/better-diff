import { rowActions } from "../client/actions";
import type { GroupName, Open, OpenFile, SidebarGroup } from "../client/groups";
import type { CommandIn } from "../client/keymap";
import { groupBar, headingKey, rowBar, rowKey } from "../client/sidebar-keys";
import type { HeadingKeys, RowKeys, Sidebar } from "../client/sidebar-keys";
import { sidebarStops } from "../client/sidebar-stops";
import type { SidebarStop } from "../client/sidebar-stops";

export function onRun(): void {}

// The commands a row and a heading both hear.
export type StopCommand = CommandIn<"row"> & CommandIn<"heading">;

interface RecordedSidebar {
  // What keys did, in order.
  done: unknown[];
  sidebar: Sidebar;
  // What keys in the file's row act with, with focus on the row itself unless said otherwise.
  row: (file: OpenFile, own?: boolean) => RowKeys;
  // What keys in the group's heading act with, expanded unless said otherwise, of a group not open.
  heading: (group: GroupName, state?: { expanded?: boolean; opened?: boolean }) => HeadingKeys;
  // Gives the command in the stop's row, or in its heading.
  key: (stop: SidebarStop, command: StopCommand) => boolean;
}

// A sidebar listing the groups, with what's open, and what keys did to it, in order, as they're
// pressed or held down. Its rows have their actions, and its headings their groups'. Moving focus
// into a file opens it.
export function sidebarOf(groups: SidebarGroup[], open?: Open, repeat = false): RecordedSidebar {
  const done: unknown[] = [];

  const sidebar: Sidebar = {
    list: {
      groups,
      stops: sidebarStops(groups, []),
      open,
      onOpen: (opened) => {
        done.push({ open: opened });
      },
      onPass: (passed) => {
        done.push({ pass: passed });
      },
    },
    focus: {
      toRow: (file) => {
        done.push({ row: file });
      },
      toStop: (stop) => {
        done.push({ stop });
      },
      toFilter: () => {
        done.push("filter");
      },
      toFile: (file, openFile) => {
        done.push({ file });
        openFile();
      },
      toGroup: (group, groupOpen) => {
        done.push({ into: group, open: groupOpen });
      },
    },
    controls: {
      press: (button) => {
        done.push({ press: button });
      },
    },
    repeat,
  };

  function row(file: OpenFile, own = true): RowKeys {
    return {
      stop: file,
      bar: rowBar(rowActions(open, file), onRun),
      own,
      onMenu: () => {
        done.push("menu");
      },
    };
  }

  function heading(group: GroupName, { expanded = true, opened = false } = {}): HeadingKeys {
    return {
      stop: { group },
      bar: groupBar(group, groups.find(({ name }) => name === group)?.files, onRun),
      expanded,
      open: opened,
      onToggle: () => {
        done.push({ toggle: group });
      },
      onOpen: () => {
        done.push({ open: { group } });
      },
    };
  }

  function key({ group, path }: SidebarStop, command: StopCommand): boolean {
    return path === undefined
      ? headingKey(command, heading(group), sidebar)
      : rowKey(command, row({ group, path }), sidebar);
  }

  return { done, sidebar, row, heading, key };
}
