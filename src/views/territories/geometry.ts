// PDF points, on ISO A4 in either orientation
export const A4 = { width: 595.28, height: 841.89 };
export const S12 = { width: 467, height: 301 };
// an A5 card fills its half of the sheet to the edge, nothing to cut away
export const A5_HORIZONTAL = { width: A4.width, height: A4.height / 2 };
export const A5_VERTICAL = { width: A4.height / 2, height: A4.width };

// the white label floating over the bottom of an A5 map, with its margin
export const MAP_LABEL_SPACE = 58;
