import { createContext } from "react";

import type { CommentTarget, Editing, ReviewComment } from "./comments";

// A comment the view's been asked to show, as a new request each time it's asked.
export interface Revealing {
  id: number;
}

// What a diff's lines are commented on with: the comments pending, by the key of the line each is
// on, the comment being written, if any, the comment to show, if any, and what starts, edits, saves,
// cancels and deletes them. What's written of the comment being written is kept apart from where
// it's written, which goes once its line moves, as when an agent changes the file, and comes back
// with what's written.
export interface Review {
  threads: ReadonlyMap<string, readonly ReviewComment[]>;
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
