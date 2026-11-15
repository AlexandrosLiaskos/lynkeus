/**
 * The explanations of the search and of its fields, one for each title, in one place. Each one shows from the
 * button beside its title.
 */
export const EXPLANATIONS = {
  tool: "The tool searches NASA's catalogue for NISAR products by area, period, orbit and radar properties, or by product names. The products found are listed in the Catalog pane and outlined on the map. The search needs no Earthdata account.",
  names:
    "The names of the product files that are searched, one on each line or with commas between them. The character * stands for any characters and the character ? for one character, as in NISAR_L2_PR_GCOV_033_*. Every product type is searched.",
  maturity:
    "The collections that are searched, by the level of validation that NASA gives them: validated, provisional or beta. Lynkeus receives layers of the validated and the provisional products alone.",
  area: "The area in which the products are searched. A product is found when its outline meets the area. The list takes the area from typed sides, from the view of the map, from a shape drawn on the map, from the outline of the selected product, or from a file.",
  west: "The western side of the rectangle in decimal degrees of longitude on WGS 84, from -180 to 180, for example -71.2. A west larger than the east gives a rectangle that crosses the meridian of 180 degrees.",
  east: "The eastern side of the rectangle in decimal degrees of longitude on WGS 84, from -180 to 180, for example -70.75.",
  south:
    "The southern side of the rectangle in decimal degrees of latitude on WGS 84, from -90 to 90, for example 42.6.",
  north:
    "The northern side of the rectangle in decimal degrees of latitude on WGS 84, from -90 to 90, for example 42.95.",
  period:
    "The days of the acquisitions that are searched. The first and the last day are whole days of Coordinated Universal Time, and both belong to the period.",
  pairs:
    "A product of this type is made from two acquisitions. The first choice finds a pair when the time from its first date to its second date overlaps the period. The second choice finds a pair only when both of its dates lie inside the period.",
  track: "The number of the track of the orbit, from 1 to 173, or a range of tracks, for example 140-142.",
  frame: "The number of the frame along the track, from 1 to 176, or a range of frames, for example 60-70.",
  cycle: "The number of the 12-day repeat of the orbit, as a whole number, for example 33.",
  pairCycle:
    "The number of the 12-day repeat of the orbit, as a whole number, for example 33. For a pair of acquisitions it is the cycle of the first date.",
  orbit: "The absolute orbit number that the record of a product states, or a range of orbits, for example 6460-6468.",
  channels:
    "The polarisation channels of the main frequency band. A product is found when it has every channel that is chosen.",
  sideChannels:
    "The polarisation channels of the side frequency band. A product is found when it has every channel that is chosen.",
  bands: "The frequency bands of the product. A product is found when it has every band that is chosen.",
} as const;
