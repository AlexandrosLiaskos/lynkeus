import { ToolForm } from "./ToolForm";
import { FINISHED_TOOLS } from "./tools";

/**
 * The tool panes of the Analysis tab: the form of each finished tool. The page holds them once, on the right
 * side of the map, where a tool pane is drawn, so that the button of a tool can open its pane.
 */
export function AnalysisDialogs() {
  return (
    <>
      {FINISHED_TOOLS.map((tool) => (
        <ToolForm key={tool} tool={tool} />
      ))}
    </>
  );
}
