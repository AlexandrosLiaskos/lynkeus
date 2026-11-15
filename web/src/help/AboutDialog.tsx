// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { version } from "../../package.json";
import { statementOf } from "../options/kept";
import { Dialog } from "../shared/dialog/Dialog";
import { PropertyList } from "../shared/properties/PropertyList";
import { Section } from "../shared/section/Section";
import { useStore } from "../shared/store";
import { ABOUT } from "./about";
import { aboutDialogStore } from "./state";

/** The authors of the citation, as a sentence names them: "A and B", or "A, B and C". */
const AUTHORS = new Intl.ListFormat("en-GB", { type: "conjunction" }).format(ABOUT.citation.authors);

/** A link to an address, written as the address. It opens in a new tab of the browser, so the page keeps its map. */
function AddressLink({ address }: { address: string }) {
  return (
    <a href={address} target="_blank" rel="noopener">
      {address}
    </a>
  );
}

/**
 * The dialog of the button About: what Lynkeus is, its facts as a list of names and values, and three sections
 * that open and close: the licence, the entry of the citation and what Lynkeus keeps for a visitor, in the
 * statements of `docs/Storage.md`.
 * The section Licence holds the notices that the licence asks every copy of Lynkeus to keep, also a copy that runs
 * as a website: the copyright, the licence, the warranty and the attribution of NOTICE, and the addresses of the
 * source code, of LICENSE and of NOTICE. It is therefore the first section, and it starts open. The statements of
 * the dialog are in `about.ts`. The version is read from `package.json` when the interface is built, so it is the
 * version of the interface that the visitor sees.
 */
export function AboutDialog() {
  const open = useStore(aboutDialogStore);
  const { citation } = ABOUT;
  return (
    <Dialog title="About Lynkeus" open={open} onClose={() => aboutDialogStore.set(false)}>
      <div className="about">
        <p>{ABOUT.purpose}</p>
        <p>{ABOUT.independence}</p>
        <PropertyList
          groups={[
            {
              rows: [
                { name: "Version", value: version },
                { name: "Developed by", value: ABOUT.team },
                { name: "Team log", value: <AddressLink address={ABOUT.teamLog} /> },
              ],
            },
          ]}
        />

        <Section title="Licence" info={ABOUT.terms}>
          <div className="about-licence">
            <p>{ABOUT.copyright}</p>
            <p>{ABOUT.licence}</p>
            <p>{ABOUT.warranty}</p>
            <h4>Attribution</h4>
            <div className="about-attribution">
              {ABOUT.attribution.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <PropertyList
              groups={[
                {
                  rows: [
                    { name: "Source code", value: <AddressLink address={citation.repository} /> },
                    { name: "Licence", value: <AddressLink address={ABOUT.licenceFile} /> },
                    { name: "Notice", value: <AddressLink address={ABOUT.noticeFile} /> },
                  ],
                },
              ]}
            />
          </div>
        </Section>

        <Section title="Citation" info={ABOUT.cite}>
          <PropertyList
            groups={[
              {
                rows: [
                  { name: "Title", value: citation.title },
                  { name: "Authors", value: AUTHORS },
                  { name: "Version", value: version },
                  { name: "Address", value: citation.site, copy: true },
                  { name: "Repository", value: citation.repository, copy: true },
                  { name: "Licence", value: citation.licence },
                ],
              },
            ]}
          />
        </Section>

        <Section title="Stored data" info={ABOUT.pane} defaultOpen={false}>
          <ul className="about-statements">
            <li>
              {statementOf("browser")} {ABOUT.parts}
            </li>
            <li>{statementOf("cookie")}</li>
            <li>{statementOf("token")}</li>
            <li>
              {statementOf("projectServer")} {statementOf("files")}
            </li>
            <li>
              {statementOf("log")} {ABOUT.searchRequest}
            </li>
            <li>{statementOf("computer")}</li>
            <li>{statementOf("nasa")}</li>
            <li>{ABOUT.teamLogStores}</li>
          </ul>
        </Section>
      </div>
    </Dialog>
  );
}
