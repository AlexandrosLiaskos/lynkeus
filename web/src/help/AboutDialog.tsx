import { version } from "../../package.json";
import { Dialog } from "../shared/dialog/Dialog";
import { useStore } from "../shared/store";
import { ABOUT } from "./about";
import { aboutDialogStore } from "./state";

/**
 * The dialog of the button About. Its statements are in `about.ts`. The version is read from `package.json` when
 * the interface is built, so it is the version of the interface that the visitor sees.
 */
export function AboutDialog() {
  const open = useStore(aboutDialogStore);
  const { citation } = ABOUT;
  return (
    <Dialog title="About Lynkeus" open={open} onClose={() => aboutDialogStore.set(false)}>
      <div className="about">
        <p>{ABOUT.purpose}</p>
        <p>{ABOUT.independence}</p>
        <dl className="about-facts">
          <dt>Version</dt>
          <dd>{version}</dd>
          <dt>Developed by</dt>
          <dd>{ABOUT.team}</dd>
          <dt>Licence</dt>
          <dd>
            {ABOUT.copyright}. {ABOUT.licence}
          </dd>
          <dt>Team log</dt>
          <dd>
            <a href={ABOUT.teamLog}>{ABOUT.teamLog}</a>
          </dd>
          <dt>Repository</dt>
          <dd>
            <a href={citation.repository}>{citation.repository}</a>
          </dd>
        </dl>

        <h3>Citation</h3>
        <p>{ABOUT.cite}</p>
        <dl className="about-facts">
          <dt>Title</dt>
          <dd>{citation.title}</dd>
          <dt>Author</dt>
          <dd>{citation.author}</dd>
          <dt>Version</dt>
          <dd>{version}</dd>
          <dt>Address</dt>
          <dd>{citation.site}</dd>
          <dt>Repository</dt>
          <dd>{citation.repository}</dd>
          <dt>Licence</dt>
          <dd>{citation.licence}</dd>
        </dl>

        <h3>What Lynkeus stores about a visitor</h3>
        <ul>
          <li>{ABOUT.applicationStores}</li>
          <li>
            {ABOUT.sessionStarts} {ABOUT.session} {ABOUT.sessionEnds}
          </li>
          <li>{ABOUT.teamLogStores}</li>
          <li>{ABOUT.serverStores}</li>
        </ul>
      </div>
    </Dialog>
  );
}
