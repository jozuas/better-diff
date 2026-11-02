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
