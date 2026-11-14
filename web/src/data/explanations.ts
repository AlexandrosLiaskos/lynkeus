/**
 * The explanations of the fields of the search, one for each field, in one place. Each one is shown with its
 * field, in whole sentences.
 */
export const EXPLANATIONS = {
  names:
    "Write one name on each line, or put commas between the names. The character * stands for any characters and ? for one character, as in NISAR_L2_PR_GCOV_033_*. Every product type is searched.",
  sides:
    "The sides are given in degrees of longitude and latitude on WGS 84. A west larger than the east crosses the meridian of 180 degrees.",
  days: "The first and the last day are days of Coordinated Universal Time.",
  track: "The track is one number, or a range such as 140-142.",
  frame: "The frame is one number, or a range such as 60-70.",
  cycle: "The cycle is the number of the 12-day repeat of the orbit.",
  pairCycle: "The cycle is the number of the 12-day repeat of the orbit. For a pair it is the cycle of the first date.",
  orbit: "The absolute orbit is one number, or a range such as 6460-6468.",
  channels: "A product is found when it has every channel and every band that is chosen.",
} as const;
