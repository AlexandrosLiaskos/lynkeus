import type { ReactNode } from "react";

/** The title bar: the name of the application and, at its right end, the account of the visitor. */
export function Header({ account }: { account?: ReactNode }) {
  return (
    <header className="header">
      <h1 className="header-name">
        <img src="/assets/lynkeus-mark.png" alt="" width="20" height="20" />
        Lynkeus
      </h1>
      {account}
    </header>
  );
}
