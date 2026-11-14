/** A button of the ribbon. */
export interface Tool {
  /** Unique name of the button. */
  id: string;
  /** Name shown under the icon. */
  label: string;
  /** Name of the icon in the icon set of the U.S. Web Design System. */
  icon: string;
  /** One sentence on what the button does. It shows when the pointer or the keyboard focus rests on the button. */
  description: string;
}

/** A group of buttons, with the name shown under it. */
export interface ToolGroup {
  label: string;
  tools: readonly Tool[];
}

/** A tab of the ribbon. Its owner declares it in his own folder. */
export interface RibbonTab {
  id: string;
  label: string;
  groups: readonly ToolGroup[];
}

/** What a finished button does. `pressed` marks a button that stays switched on, such as the chosen background map. */
export interface ToolAction {
  run: () => void;
  pressed?: boolean;
}

/** The actions of the finished buttons, by the name of the button. A button without an action is shown in grey. */
export type ToolActions<Id extends string = string> = Partial<Record<Id, ToolAction>>;

/** The names of the buttons that a tab declares. */
export type ToolIdOf<Tab extends RibbonTab> = Tab["groups"][number]["tools"][number]["id"];
