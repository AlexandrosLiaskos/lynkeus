import { AboutDialog } from "./AboutDialog";
import { SourcesDialog } from "./SourcesDialog";

/** The dialogs of the Help tab. The page holds them once, so that any button can open them. */
export function HelpDialogs() {
  return (
    <>
      <SourcesDialog />
      <AboutDialog />
    </>
  );
}
