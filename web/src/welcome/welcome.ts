/** A member of the team, as the welcome screen shows him. */
export interface Member {
  name: string;
  /** The file of his photo in `public/assets/welcome/`. */
  photo: string;
  /** Where a press on the member leads: his site, or a letter to his address. */
  address: string;
  /** What the link does, for a reader of the screen. */
  label: string;
}

/** A logo at the foot of the welcome screen. Its file is in `public/assets/welcome/`. */
export interface Logo {
  /** Name of the owner of the logo. */
  name: string;
  file: string;
  /** The site of the owner. */
  address: string;
}

/** The texts of the welcome screen. */
export const WELCOME = {
  name: "Lynkeus",
  subtitle: "NISAR Surface Change Analysis Platform",
  /** The image behind the texts: NASA's illustration of the NISAR satellite, PIA26611. */
  image: { file: "nisar.webp", credit: "Image: NASA/JPL-Caltech, artist's concept" },
  team: [
    {
      name: "Alexandros Liaskos",
      photo: "alexandros-liaskos.webp",
      address: "https://liaskos.eu/",
      label: "Site of Alexandros Liaskos",
    },
    {
      name: "Stelios Simiakos",
      photo: "stelios-simiakos.webp",
      address: "mailto:simoste2008@gmail.com",
      label: "Email Stelios Simiakos",
    },
    {
      name: "Andreas Liaskos",
      photo: "andreas-liaskos.webp",
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
