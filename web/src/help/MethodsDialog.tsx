import { Marked, plain } from "../analysis/Marked";
import type { Block, Method } from "../analysis/methods";
import { METHODS } from "../analysis/methodSheets";
import { FINISHED_TOOLS, type FinishedTool } from "../analysis/tools";
import { Dialog } from "../shared/dialog/Dialog";
import { PropertyList, type Property } from "../shared/properties/PropertyList";
import { Section } from "../shared/section/Section";
import { useStore } from "../shared/store";
import { ABOUT } from "./about";
import { methodsStore } from "./state";

/** What the "i" beside the name of a tool says. */
export const SHEET_INFO =
  "The method sheet of the tool, as the repository holds it in the folder docs/methods. The last row gives the address of the whole sheet.";

/**
 * The readable names of the fields of the layer description that the table Legend of a sheet lists. The name
 * of the field itself stands behind the "i" of its row.
 */
export const LEGEND_NAMES: Record<string, string> = {
  quantity: "Quantity",
  unit: "Unit",
  range: "Range",
  colours: "Colour scale",
};

/** Return the address of the method sheet of a tool in the repository. */
export function sheetAddress(tool: FinishedTool): string {
  return `${ABOUT.citation.repository}/blob/main/docs/methods/${tool}.md`;
}

/** Return a row of a table of two columns as a name and a value. */
function property([name = "", value = ""]: readonly string[]): Property {
  const field = plain(name);
  const readable = LEGEND_NAMES[field];
  return readable === undefined
    ? { name: field, value: <Marked text={value} /> }
    : { name: readable, value: <Marked text={value} />, info: `The field ${field} of the layer description.` };
}

/**
 * A part of a section of a sheet: a paragraph, a formula, a numbered list, or a table as a list of names and
 * values. A table of two columns is one list. A wider table gives one list for each of its rows, with the heads
 * of its columns as the names.
 */
export function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "text":
      return (
        <p>
          <Marked text={block.text} />
        </p>
      );
    case "code":
      return (
        <pre className="methods-formula">
          <code>{block.code}</code>
        </pre>
      );
    case "list":
      return (
        <ol className="methods-list">
          {block.items.map((item) => (
            <li key={item}>
              <Marked text={item} />
            </li>
          ))}
        </ol>
      );
    case "table":
      return block.head.length === 2 ? (
        <PropertyList groups={[{ rows: block.rows.map(property) }]} />
      ) : (
        <PropertyList
          groups={block.rows.map((row) => ({
            rows: block.head.map((name, index) => ({ name, value: <Marked text={row[index] ?? ""} /> })),
          }))}
        />
      );
  }
}

/** Tell whether a text stands in one of the paragraphs of the sections of a sheet. */
function isShown(method: Method, text: string): boolean {
  return method.sections.some(({ blocks }) =>
    blocks.some((block) => block.kind === "text" && block.text.includes(text)),
  );
}

/**
 * The method sheet of one tool: the table under its title, its sections under their headings, what it states
 * about the mask of the product where no section shown holds it, and the address of the whole sheet.
 */
export function MethodSheet({ tool }: { tool: FinishedTool }) {
  const method = METHODS[tool];
  const address = sheetAddress(tool);
  return (
    <div className="methods-sheet">
      <PropertyList groups={[{ rows: method.summary.map(property) }]} />
      {method.sections.map(({ title, blocks }) => (
        <div key={title} className="methods-section">
          <h4 className="property-group-title">{title}</h4>
          {blocks.map((block, index) => (
            <BlockView key={index} block={block} />
          ))}
        </div>
      ))}
      {isShown(method, method.mask) ? null : (
        <div className="methods-section">
          <h4 className="property-group-title">Mask of the product</h4>
          <p>
            <Marked text={method.mask} />
          </p>
        </div>
      )}
      <PropertyList
        groups={[
          {
            rows: [
              {
                name: "Whole sheet",
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
    </div>
  );
}

/**
 * The sheets of the finished tools, each in a section that opens and closes under the name of its tool. When
 * the sheet of one tool was asked for, its section is open and the others are closed.
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
 * The dialog of the button Methods: the method sheet of each finished tool. The sheets are drawn each time the
 * dialog opens, so the sections that are open follow the tool that was asked for.
 */
export function MethodsDialog() {
  const { open, tool } = useStore(methodsStore);
  return (
    <Dialog title="Methods" open={open} onClose={() => methodsStore.set({ open: false, tool })} large>
      {open ? <MethodsList asked={tool} /> : null}
    </Dialog>
  );
}
