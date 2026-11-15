import { AboutDialog } from "./AboutDialog";
import { GettingStartedPane } from "./GettingStarted";
import { MethodsDialog } from "./MethodsDialog";
import { SourcesDialog } from "./SourcesDialog";

/**
 * The pane and the dialogs of the Help tab. The page holds them once, on the right side of the map, where a
 * pane is drawn, so that any button can open them.
 */
export function HelpDialogs() {
  return (
    <>
      <GettingStartedPane />
      <MethodsDialog />
      <SourcesDialog />
      <AboutDialog />
    </>
  );
}
