/** The title bar: the name of the application and the link to the team log. */
export function Header() {
  return (
    <header className="header">
      <h1 className="header-name">
        <img src="/assets/lynkeus-mark.png" alt="" width="20" height="20" />
        Lynkeus
      </h1>
      <nav aria-label="Site">
        <a href="/team-log/">Team log</a>
      </nav>
    </header>
  );
}
