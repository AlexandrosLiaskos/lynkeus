import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { Icon } from "../shared/icon/Icon";
import { visits } from "./visits";
import { WELCOME } from "./welcome";

/** What the window knows of the total of page visits: the total, that it was asked, or that no answer came. */
type Total = number | "asked" | "unknown";

const NUMBERS = new Intl.NumberFormat("en");

/** The words in the place of the total. */
function totalWords(total: Total): string {
  if (total === "asked") {
    return "—";
  }
  return total === "unknown" ? "not available" : NUMBERS.format(total);
}

interface WelcomeProps {
  /** Ask for the total of recorded page visits. A test gives its own. */
  load?: () => Promise<number>;
}

/**
 * The welcome window, which the page shows when it opens. It names the platform and says in a few sentences what
 * it does, for a visitor who knows nothing of it. Below stand three facts of the satellite, the team, the
 * developer of the site, the total of recorded page visits, and the event for which Lynkeus was started with the
 * logos of its organisers and of the universities of the team. Every member, the signature, the event and every
 * logo is a link.
 *
 * It is the dialog element of the browser, opened as a modal, like the dialog that every part shares: the
 * browser keeps the keyboard focus inside it and closes it on the Escape key. The first focus goes to the title,
 * so that a reader of the screen starts from the name.
 */
export function Welcome({ load = visits }: WelcomeProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const noteId = useId();
  const [total, setTotal] = useState<Total>("asked");

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) {
      element.showModal();
      title.current?.focus();
    }
  }, []);

  useEffect(() => {
    let shown = true;
    void load().then(
      (count) => {
        if (shown) {
          setTotal(count);
        }
      },
      () => {
        if (shown) {
          setTotal("unknown");
        }
      },
    );
    return () => {
      shown = false;
    };
  }, [load]);

  // A click on the shaded page around the window reaches the dialog element itself and not its content.
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) {
      event.currentTarget.close();
    }
  };

  return (
    <dialog ref={dialog} className="welcome" aria-labelledby={titleId} onClick={onClick}>
      <div className="welcome-poster">
        <p className="welcome-mark">
          <img src="/assets/lynkeus-mark.svg" alt="" />
          Team Lynkeus
        </p>
        <header className="welcome-masthead">
          <p className="welcome-kind">{WELCOME.kind}</p>
          <h2 className="welcome-title" id={titleId} ref={title} tabIndex={-1}>
            {WELCOME.name} <em>{WELCOME.subtitle}</em>
          </h2>
          <p className="welcome-description">{WELCOME.description}</p>
          <dl className="welcome-facts">
            {WELCOME.facts.map(({ label, value }) => (
              <div key={label}>
                <dt className="welcome-label">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </header>
        <div className="welcome-credits">
          <section className="welcome-team">
            <h3 className="welcome-label">Research team</h3>
            <ul>
              {WELCOME.team.map(({ name, initials, address, label }) => (
                <li key={name}>
                  <a
                    href={address}
                    aria-label={label}
                    title={address.replace(/^mailto:/, "")}
                    {...(address.startsWith("mailto:") ? {} : { target: "_blank", rel: "noreferrer" })}
                  >
                    <span className="welcome-avatar" aria-hidden="true">
                      {initials}
                    </span>
                    <span className="welcome-name">{name}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
          <section className="welcome-developer">
            <h3 className="welcome-label">Website developed by</h3>
            <a
              href={WELCOME.developer.address}
              aria-label={`Site of ${WELCOME.developer.name}`}
              title={WELCOME.developer.address}
              target="_blank"
              rel="noreferrer"
            >
              <img src="/assets/welcome/signature.png" alt="" />
              <span className="welcome-name">{WELCOME.developer.name}</span>
            </a>
          </section>
          <section className="welcome-visits">
            <h3 className="welcome-label">Recorded page visits</h3>
            <p role="status" aria-describedby={noteId}>
              {totalWords(total)}
            </p>
            <p className="welcome-unseen" id={noteId}>
              The server stores only the total number of visits.
            </p>
          </section>
        </div>
        <footer className="welcome-event">
          <p>
            <a href={WELCOME.event.address} target="_blank" rel="noreferrer">
              {WELCOME.event.name}
            </a>{" "}
            • {WELCOME.event.place}
          </p>
          <ul>
            {WELCOME.logos.map(({ name, file, address }) => (
              <li key={file}>
                <a href={address} title={name} target="_blank" rel="noreferrer">
                  <img src={`/assets/welcome/${file}`} alt={name} />
                </a>
              </li>
            ))}
          </ul>
        </footer>
        <button
          type="button"
          className="welcome-close"
          aria-label="Close this window"
          onClick={() => dialog.current?.close()}
        >
          <Icon name="close" />
        </button>
      </div>
    </dialog>
  );
}
