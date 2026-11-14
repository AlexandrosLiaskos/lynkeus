import { useId } from "react";
import { Dialog } from "../shared/dialog/Dialog";
import { useStore } from "../shared/store";
import { SOURCE_PARTS, type SourcePart } from "./sources";
import { sourcesDialogStore } from "./state";

/**
 * The sources of each part, under the name of the part: a table with one row for each source, or a sentence when
 * the part lists nothing yet. The frame of a table scrolls sideways in a narrow window, so it can take the
 * keyboard focus, as the design system asks of a scrollable table.
 */
export function SourcesList({ parts }: { parts: readonly SourcePart[] }) {
  const id = useId();
  return (
    <div className="sources">
      <p>
        Each part of Lynkeus keeps the list of the methods, programs and datasets that it uses, with their licences.
        This page joins the lists.
      </p>
      {parts.map(({ name, sources }, index) => {
        const headingId = `${id}-${String(index)}`;
        return (
          <div key={name} className="sources-part">
            <h3 id={headingId}>{name}</h3>
            {sources.length === 0 ? (
              <p>This part lists nothing yet.</p>
            ) : (
              <div className="usa-table-container--scrollable" role="region" aria-labelledby={headingId} tabIndex={0}>
                <table className="usa-table usa-table--borderless usa-table--compact" aria-labelledby={headingId}>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Version</th>
                      <th scope="col">Licence</th>
                      <th scope="col">Use</th>
                      <th scope="col">Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map(({ name: source, version, licence, use, url }) => (
                      <tr key={source}>
                        <th scope="row">{source}</th>
                        <td>{version}</td>
                        <td>{licence}</td>
                        <td>{use}</td>
                        <td>
                          <a href={url}>{url}</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The dialog of the button Sources. */
export function SourcesDialog() {
  const open = useStore(sourcesDialogStore);
  return (
    <Dialog title="Sources" open={open} onClose={() => sourcesDialogStore.set(false)}>
      <SourcesList parts={SOURCE_PARTS} />
    </Dialog>
  );
}
