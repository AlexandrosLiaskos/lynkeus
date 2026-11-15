import { version } from "../../package.json";
import { Dialog } from "../shared/dialog/Dialog";
import { PropertyList } from "../shared/properties/PropertyList";
import { Section } from "../shared/section/Section";
import { useStore } from "../shared/store";
import { ABOUT } from "./about";
import { aboutDialogStore } from "./state";

/** A link to an address, written as the address. It opens in a new tab of the browser, so the page keeps its map. */
function AddressLink({ address }: { address: string }) {
  return (
    <a href={address} target="_blank" rel="noopener">
      {address}
    </a>
  );
}

/**
 * The dialog of the button About: what Lynkeus is, its facts as a list of names and values, and two sections
 * that open and close, the entry of the citation and the data that Lynkeus stores about a visitor. Its statements
 * are in `about.ts`. The version is read from `package.json` when the interface is built, so it is the version of
 * the interface that the visitor sees.
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
                { name: "Licence", value: `${ABOUT.copyright}. ${ABOUT.licence}` },
                { name: "Team log", value: <AddressLink address={ABOUT.teamLog} /> },
                { name: "Repository", value: <AddressLink address={citation.repository} /> },
              ],
            },
          ]}
        />

        <Section title="Citation" info={ABOUT.cite}>
          <PropertyList
            groups={[
              {
                rows: [
                  { name: "Title", value: citation.title },
                  { name: "Author", value: citation.author },
                  { name: "Version", value: version },
                  { name: "Address", value: citation.site, copy: true },
                  { name: "Repository", value: citation.repository, copy: true },
                  { name: "Licence", value: citation.licence },
                ],
              },
            ]}
          />
        </Section>

        <Section
          title="Stored data"
          info="The data that Lynkeus stores about a visitor, in the browser and on its server."
          defaultOpen={false}
        >
          <ul className="about-statements">
            <li>{ABOUT.applicationStores}</li>
            <li>
              {ABOUT.sessionStarts} {ABOUT.session} {ABOUT.sessionEnds}
            </li>
            <li>{ABOUT.teamLogStores}</li>
            <li>{ABOUT.serverStores}</li>
          </ul>
        </Section>
      </div>
    </Dialog>
  );
}
