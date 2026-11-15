/** A member of the team, as the welcome window shows him. */
export interface Member {
  name: string;
  /** The file of his photo in `public/assets/welcome/`, or null while there is none. */
  photo: string | null;
  /** The two letters inside the circle above the name, shown while there is no photo. */
  initials: string;
  /** Where a press on the member leads: his site, or a letter to his address. */
  address: string;
  /** What the link does, for a reader of the screen. */
  label: string;
}

/** A logo at the foot of the welcome window. Its file is in `public/assets/welcome/`. */
export interface Logo {
  /** Name of the owner of the logo. */
  name: string;
  file: string;
  /** The site of the owner. */
  address: string;
}

/**
 * The texts of the welcome window.
 *
 * The three facts of the satellite are those of the mission overview of NASA's Jet Propulsion Laboratory
 * (https://www.jpl.nasa.gov/press-kits/nisar/mission-overview/): NASA and the Indian Space Research Organisation
 * operate NISAR jointly, and its radars scan nearly all the land and ice surfaces of the planet twice every 12
 * days.
 */
export const WELCOME = {
  kind: "A WebGIS • 2026",
  name: "Lynkeus",
  subtitle: "NISAR Surface Change Analysis Platform",
  description:
    "Lynkeus maps change on the Earth's surface with radar images of NISAR, the satellite of NASA and ISRO. Search an area and a period, add the images to the map and compare two dates.",
  facts: [
    { label: "Satellite", value: "NISAR, NASA–ISRO" },
    { label: "Coverage", value: "Nearly all land and ice" },
    { label: "Observation", value: "Twice every 12 days" },
  ],
  team: [
    {
      name: "Alexandros Liaskos",
      photo: "alexandros-liaskos.webp",
      initials: "AL",
      address: "https://liaskos.eu/",
      label: "Site of Alexandros Liaskos",
    },
    {
      name: "Stelios Simiakos",
      photo: null,
      initials: "SS",
      address: "mailto:simoste2008@gmail.com",
      label: "Email Stelios Simiakos",
    },
    {
      name: "Andreas Liaskos",
      photo: "andreas-liaskos.webp",
      initials: "AL",
      address: "mailto:andreasliaskos7@gmail.com",
      label: "Email Andreas Liaskos",
    },
  ],
  developer: { name: "Alexandros Liaskos", address: "https://liaskos.eu/" },
  event: {
    name: "NASA Space Apps Challenge Hackathon",
    address: "https://www.spaceappschallenge.org/2026/local-events/athens/",
    place: "Athens, 14–15 November 2026",
  },
  logos: [
    { name: "NASA", file: "nasa.svg", address: "https://www.nasa.gov/" },
    { name: "NASA Space Apps Challenge", file: "space-apps.png", address: "https://www.spaceappschallenge.org/" },
    { name: "National and Kapodistrian University of Athens", file: "nkua.png", address: "https://en.uoa.gr/" },
    { name: "National Technical University of Athens", file: "ntua.png", address: "https://www.ntua.gr/" },
  ],
} as const satisfies {
  team: readonly Member[];
  logos: readonly Logo[];
  [text: string]: unknown;
};
