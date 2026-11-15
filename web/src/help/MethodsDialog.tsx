import { Marked } from "../analysis/Marked";
import { METHODS } from "../analysis/methodSheets";
import { FINISHED_TOOLS, type FinishedTool } from "../analysis/tools";
import { Dialog } from "../shared/dialog/Dialog";
import { PropertyList } from "../shared/properties/PropertyList";
import { Section } from "../shared/section/Section";
import { useStore } from "../shared/store";
import { ABOUT } from "./about";
import { methodsStore } from "./state";

/** What the "i" beside the name of a tool says. */
export const SHEET_INFO = "A summary of the method. The full sheet is in the repository.";

/** Return the address of the method sheet of a tool in the repository. */
export function sheetAddress(tool: FinishedTool): string {
  return `${ABOUT.citation.repository}/blob/main/docs/methods/${tool}.md`;
}

/**
 * The summary of the method of one tool, as one list of names and values: the rows of the section In brief of
 * its method sheet, in their order, and the address of the full sheet in the repository.
 */
export function MethodSheet({ tool }: { tool: FinishedTool }) {
  const address = sheetAddress(tool);
  return (
    <PropertyList
      groups={[
        {
          rows: [
            ...METHODS[tool].rows.map(({ name, text }) => ({ name, value: <Marked text={text} /> })),
            {
              name: "Full method sheet",
              value: (
                <a href={address} target="_blank" rel="noopener">
                  {address}
                </a>
              ),
            },
          ],
        },
      ]}
    />
  );
}

/**
 * The summaries of the methods of the finished tools, each in a section that opens and closes under the name of
 * its tool. When the method of one tool was asked for, its section is open and the others are closed.
 */
export function MethodsList({ asked }: { asked: FinishedTool | null }) {
  return (
    <div className="methods">
      {FINISHED_TOOLS.map((tool) => (
        <Section
          key={tool}
          title={METHODS[tool].title}
          info={SHEET_INFO}
          defaultOpen={asked === null || asked === tool}
        >
          <MethodSheet tool={tool} />
        </Section>
      ))}
    </div>
  );
}

/**
 * The dialog of the button Methods: the summary of the method of each finished tool. The sections are drawn
 * each time the dialog opens, so the sections that are open follow the tool that was asked for.
 */
export function MethodsDialog() {
  const { open, tool } = useStore(methodsStore);
  return (
    <Dialog title="Methods" open={open} onClose={() => methodsStore.set({ open: false, tool })} large>
      {open ? <MethodsList asked={tool} /> : null}
    </Dialog>
  );
}
