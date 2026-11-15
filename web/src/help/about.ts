/**
 * The statements of the dialog About. Each one is copied from the public text of the repository that is named
 * beside it, and the tests compare it with that text, so that a change of the text is noticed here.
 */
export const ABOUT = {
  /** README.md, the first paragraph. */
  purpose:
    'Lynkeus is a web platform for the analysis of surface change with radar data of the NISAR mission. It is developed by Team Lynkeus, was started for the 2026 NASA Space Apps Challenge (challenge "Dancing with the SARs"), and is intended for continued use.',
  /** README.md, the second paragraph. */
  independence:
    "Lynkeus is an independent project. It is not sponsored or endorsed by the National Aeronautics and Space Administration (NASA).",
  /** README.md: "It is developed by Team Lynkeus". */
  team: "Team Lynkeus",
  /** README.md, the address of the team log. */
  teamLog: "https://lynkeus.nkua.cloud/team-log/",
  /** NOTICE. */
  copyright: "Copyright 2026 Alexandros Liaskos",
  /** NOTICE. */
  licence: "This product is licensed under the Apache License, Version 2.0.",
  /** README.md, the section Citation and licence, without the marks of its link. */
  cite: "To cite Lynkeus, use the entry in CITATION.cff.",
  /** CITATION.cff: the fields of the entry, except the version, which the dialog reads from `package.json`. */
  citation: {
    title: "Lynkeus",
    author: "Alexandros Liaskos",
    site: "https://lynkeus.nkua.cloud/",
    repository: "https://github.com/AlexandrosLiaskos/lynkeus",
    licence: "Apache-2.0",
  },
  /**
   * What the code does: `web/src/shared/storage/storage.ts` keeps the parts of the work that six files declare,
   * and no other file of `web/src` uses the storage of the browser or a cookie.
   */
  applicationStores:
    "The page of the application keeps in the local storage of the browser the parts of the work that the user lets it keep: the bookmarks, the view of the map, the panes, the area, the form of the search and the layers of the map. The pane Browser storage of the View tab lists them, switches each one off and clears it.",
  /** What `api/src/lynkeus/routes.py` does: three of its addresses create a session. */
  sessionStarts:
    "The web service creates a session when it is asked whether the visitor is signed in to Earthdata, when the visitor signs in, and when the visitor starts a job.",
  /** `api/src/lynkeus/sessions.py`, the first paragraph of its description. */
  session:
    "A session is named by a key that the browser holds in a cookie. The key is random and carries no meaning. The store holds its SHA-256 digest only. A session owns the jobs and the layers of a visitor, and it may hold the Earthdata token with which the visitor signed in. The token is kept in the memory of the server only, and it is forgotten when the visitor signs out, when the session is not used for some time, and when the server stops.",
  /** `api/src/lynkeus/sessions.py`: the value of `SESSION_IDLE_TIME` and its description. */
  sessionEnds: "A session that is not used for 7 days is removed with its jobs and layers.",
  /** The page of the team log, in `api/src/lynkeus/team_log.py`, says this of itself with the words "This page". */
  teamLogStores:
    "The page of the team log uses no cookies. It keeps one marker in the browser, so that a visit is counted once, and the server stores only the total number of visits.",
  /**
   * What `web/nginx.conf` does: it turns the request log off for the counter of visits only, so nginx writes its
   * log for every other request. The address of a search is built in `web/src/data/products.ts`.
   */
  serverStores:
    "The web server of the site writes each request in its log, except the requests to the counter of visits. A line of the log holds the address of the visitor, the time, the request, the page that led to it and the name of the browser. The request of a search holds the product type, the area and the period.",
} as const;
