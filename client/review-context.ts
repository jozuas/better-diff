import { createContext } from "react";

import type { CommentTarget, Editing, ReviewComment } from "./comments";
import type { FileComments } from "./placing";

// A comment the view's been asked to show, as a new request each time it's asked.
export interface Revealing {
  id: number;
}

// What a diff's lines are commented on with: what shows under the lines of the diffs of the file at
// the path, of the comments pending and the one being written, on the lines theirs are now, the same
// each time for the same file, whether any comment is on the file, or being written on it, the
// comment being written, if any, the comment to show, if any, and what starts, edits, saves, cancels
// and deletes them. What's written of the comment being written is kept apart from where it's
// written, which goes while its line is changed or removed, as when an agent changes the file, and
// comes back with what's written.
export interface Review {
  commentsIn: (path: string) => FileComments;
  commentedOn: (path: string) => boolean;
  editing: Editing | undefined;
  revealing: Revealing | undefined;
  onStart: (target: CommentTarget) => void;
  onEdit: (comment: ReviewComment, where: Editing["where"]) => void;
  written: () => string;
  onWrite: (text: string) => void;
  onCancel: () => void;
  onSave: (text: string) => void;
  onDelete: (id: number) => void;
}

// A view's, while its lines can be commented on.
export const ReviewContext = createContext<Review | undefined>(undefined);
