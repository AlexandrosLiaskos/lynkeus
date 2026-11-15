// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { KEPT } from "../options/kept";

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
  /**
   * NOTICE, the line of the copyright. It opens the notices of the licence that the dialog shows as NOTICE gives
   * them: the copyright, the licence, the warranty and the attribution, with the addresses of the source code, of
   * LICENSE and of NOTICE. The licence calls them the Appropriate Legal Notices of the interface, and every copy of
   * Lynkeus keeps them, also a copy that runs as a website (NOTICE, term 1).
   */
  copyright: "Copyright 2026 Alexandros Liaskos",
  /** NOTICE, the first sentence of its notice of the licence. */
  licence:
    "Lynkeus is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License, version 3, as published by the Free Software Foundation, and the additional terms under its section 7 that are given in the file NOTICE.",
  /** NOTICE, the sentence on the warranty. */
  warranty:
    "Lynkeus is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.",
  /** NOTICE, the two lines of the section Attribution. */
  attribution: [
    "Lynkeus, by Alexandros Liaskos and Team Lynkeus.",
    "Liaskos, A., and Team Lynkeus (2026). Lynkeus: a web platform for the analysis of surface change with radar data of the NISAR mission [software]. https://github.com/AlexandrosLiaskos/lynkeus",
  ],
  /** The addresses of the files LICENSE and NOTICE in the repository. */
  licenceFile: "https://github.com/AlexandrosLiaskos/lynkeus/blob/main/LICENSE",
  noticeFile: "https://github.com/AlexandrosLiaskos/lynkeus/blob/main/NOTICE",
  /** README.md, the section Citation and licence: what the additional terms ask. */
  terms:
    "Every copy and every work based on Lynkeus, also one that is offered as a service over a network, must keep the attribution to Alexandros Liaskos and Team Lynkeus that NOTICE gives. A modified version must say that it is modified, and by whom. The names of the authors, the name Lynkeus and its logo are not licensed for other works, except in that attribution.",
  /** README.md, the section Citation and licence, without the marks of its link. */
  cite: "To cite Lynkeus, use the entry in CITATION.cff.",
  /**
   * CITATION.cff: the fields of the entry, except the version, which the dialog reads from `package.json`. An author
   * is a person, named by the given and the family names, or an entity, named by its name.
   */
  citation: {
    title: "Lynkeus",
    authors: ["Alexandros Liaskos", "Team Lynkeus"],
    site: "https://lynkeus.nkua.cloud/",
    repository: "https://github.com/AlexandrosLiaskos/lynkeus",
    licence: "AGPL-3.0-only",
  },
  /**
   * docs/Storage.md, the table "What is kept": what Lynkeus keeps, where and for how long. The statements are
   * held in `web/src/options/kept.ts`, because the pane Storage shows the same ones.
   */
  kept: KEPT,
  /**
   * What the code does: `web/src/shared/storage/storage.ts` keeps the parts of the work that seven files declare,
   * and no other file of `web/src` uses the storage of the browser or a cookie.
   */
  parts:
    "The parts are the bookmarks, the view of the map, the panes, the area, the form of the search, the layers of the map and the marker of a counted visit.",
  /** docs/Storage.md, principle 7, and its section "Pane Storage". */
  pane: "The pane Storage of the Options tab shows everything that is kept for you, with its size and its date, and removes each part.",
  /** The page of the team log, in `api/src/lynkeus/team_log.py`, says this of itself with the words "This page". */
  teamLogStores:
    "The page of the team log uses no cookies. It keeps one marker in the browser, so that a visit is counted once, and the server stores only the total number of visits.",
  /** The address of a search is built in `web/src/data/search.ts`, and the web server writes it in its log. */
  searchRequest: "The request of a search holds the product type, the area and the period.",
} as const;
