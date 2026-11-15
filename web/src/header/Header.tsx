// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { ReactNode } from "react";
import { VersionNotice } from "./notice/VersionNotice";

/**
 * The title bar: the name of the application, its version beside the name and, at its right end, the account of
 * the visitor. It stands on a dark strip of the image of the welcome screen, so its mark and its texts are white.
 */
export function Header({ account }: { account?: ReactNode }) {
  return (
    <header className="header">
      <h1 className="header-name">
        <img src="/assets/lynkeus-mark-white.svg" alt="" width="23" height="24" />
        Lynkeus
      </h1>
      <VersionNotice />
      {account}
    </header>
  );
}
