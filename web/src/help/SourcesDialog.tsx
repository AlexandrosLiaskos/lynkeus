// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { Dialog } from "../shared/dialog/Dialog";
import { EmptyState } from "../shared/empty/EmptyState";
import { Section } from "../shared/section/Section";
import { useStore } from "../shared/store";
import { SOURCE_PARTS, type SourcePart } from "./sources";
import { sourcesDialogStore } from "./state";

/** What the "i" beside the name of a part says. */
export const PART_INFO = "The methods, programs and datasets that this part of Lynkeus uses, with their licences.";

/**
 * The sources of each part, in a section that opens and closes under the name of the part and the number of its
 * sources: a table with one row for each source, or a statement when the part lists nothing yet. The frame of a
 * table scrolls sideways in a narrow window, so it can take the keyboard focus, as the design system asks of a
 * scrollable table.
 */
export function SourcesList({ parts }: { parts: readonly SourcePart[] }) {
  return (
    <div className="sources">
      {parts.map(({ name, sources }) => (
        <Section key={name} title={name} count={sources.length} info={PART_INFO}>
          {sources.length === 0 ? (
            <EmptyState title="No sources" text="This part has listed no source yet." />
          ) : (
            <div className="usa-table-container--scrollable" role="region" aria-label={name} tabIndex={0}>
              <table className="usa-table usa-table--borderless usa-table--compact" aria-label={name}>
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
                        <a href={url} target="_blank" rel="noopener">
                          {url}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      ))}
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
