// Where what an element of a view marks is: by the mark's id, how far below the view's top the
// element's top is.
export interface Place {
  id: string;
  offset: number;
}

// Of the places of a view's markers, in the page's order, that of the one what the view shows at
// its top is under: the last at or above its top, or else the first.
export function topPlace(places: readonly Place[]): Place | undefined {
  return places.findLast(({ offset }) => offset <= 0) ?? places[0];
}

// Where a hunk was in a view, by its index in its diff and how far below the view's top its first
// line was, while the view showed what `shown` says of the diff.
export interface HunkPlace {
  hunk: number;
  offset: number;
  shown: string;
}

// The place the view should show the hunk with its index in again, once it shows what `shown` says:
// the one held, unless that's what it showed then.
export function placeToShow(place: HunkPlace | undefined, shown: string): HunkPlace | undefined {
  return place?.shown === shown ? undefined : place;
}

// The place still held once the view shows what `shown` says, as of then: while an action is
// `busy`, and none once none is.
export function placeHeld(
  place: HunkPlace | undefined,
  shown: string,
  busy: boolean,
): HunkPlace | undefined {
  return busy && place !== undefined ? { ...place, shown } : undefined;
}
