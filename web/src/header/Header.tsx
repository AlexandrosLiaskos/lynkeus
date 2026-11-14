import type { ReactNode } from "react";
import { VersionNotice } from "./notice/VersionNotice";

/**
 * The title bar: the name of the application, its version beside the name and, at its right end, the account of
 * the visitor.
 */
export function Header({ account }: { account?: ReactNode }) {
  return (
    <header className="header">
      <h1 className="header-name">
        <img src="/assets/lynkeus-mark.png" alt="" width="20" height="20" />
        Lynkeus
      </h1>
      <VersionNotice />
      {account}
    </header>
  );
}
