import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type SyntheticEvent,
  type WheelEvent,
} from "react";
import { visits } from "./visits";
import { WELCOME } from "./welcome";

/** What the screen knows of the total of page visits: the total, that it was asked, or that no answer came. */
type Total = number | "asked" | "unknown";

const NUMBERS = new Intl.NumberFormat("en");

/** The words in the place of the total. */
function totalWords(total: Total): string {
  if (total === "asked") {
    return "—";
  }
  return total === "unknown" ? "not available" : NUMBERS.format(total);
}

/** The time that the screen takes to slide away, in milliseconds. The style of the screen names the same time. */
export const SLIDE_TIME = 700;

/** How far upward a drag must go to open the page, in pixels. */
const DRAG_LIMIT = 80;

/** Tell whether an event began on a link or a button of the screen, which then keeps its own meaning. */
function onControl(target: EventTarget): boolean {
  return target instanceof Element && target.closest("a, button") !== null;
}

interface WelcomeProps {
  /** Ask for the total of recorded page visits. A test gives its own. */
  load?: () => Promise<number>;
}

/**
 * The welcome screen, which covers the page when it opens, as the lock screen of a computer covers the desktop.
 * It shows an illustration of the NISAR satellite and, at its right, the name of the platform, the team, the
 * developer of the site, the total of recorded page visits, and the event for which Lynkeus was started with the
 * logos of its organisers and of the universities of the team. Every member, the signature, the event and every
 * logo is a link.
 *
 * The visitor slides the screen up to enter: with the arrow at its foot, by dragging it upward, by scrolling, or
 * with the Enter, Space, Up or Escape key. The screen then moves up out of the window and the page stands under
 * it.
 *
 * It is the dialog element of the browser, opened as a modal, so the browser keeps the keyboard focus inside it
 * until the visitor enters.
 */
export function Welcome({ load = visits }: WelcomeProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  // The height of the pointer where a drag began, and null while nothing is dragged.
  const drag = useRef<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [total, setTotal] = useState<Total>("asked");

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) {
      element.showModal();
      element.focus();
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

  // The screen closes when it has moved out of the window, and at once for a visitor who has asked for less motion.
  useEffect(() => {
    if (!leaving) {
      return;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => dialog.current?.close(), still ? 0 : SLIDE_TIME);
    return () => {
      window.clearTimeout(timer);
    };
  }, [leaving]);

  /** Slide the screen up from where it stands. */
  const enter = () => {
    const element = dialog.current;
    if (element) {
      element.style.transition = "";
      element.style.transform = "";
    }
    setLeaving(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (["Enter", " ", "ArrowUp"].includes(event.key) && !onControl(event.target)) {
      event.preventDefault();
      enter();
    }
  };

  // The Escape key would close the dialog at once. It slides the screen up instead.
  const onCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    enter();
  };

  // A scroll downward moves a page up, so it moves the screen up, unless the texts themselves have to scroll.
  const onWheel = (event: WheelEvent<HTMLDialogElement>) => {
    const texts = content.current;
    if (event.deltaY > 20 && texts && texts.scrollHeight <= texts.clientHeight) {
      enter();
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDialogElement>) => {
    if (event.button === 0 && !onControl(event.target)) {
      drag.current = event.clientY;
    }
  };

  // The screen follows the pointer upward, and never below its place.
  const onPointerMove = (event: PointerEvent<HTMLDialogElement>) => {
    if (drag.current !== null) {
      const moved = Math.min(0, event.clientY - drag.current);
      event.currentTarget.style.transition = "none";
      event.currentTarget.style.transform = `translateY(${String(moved)}px)`;
    }
  };

  // A drag that went far enough opens the page, and a shorter one lets the screen return.
  const onPointerEnd = (event: PointerEvent<HTMLDialogElement>) => {
    if (drag.current === null) {
      return;
    }
    const moved = drag.current - event.clientY;
    drag.current = null;
    if (moved > DRAG_LIMIT) {
      enter();
    } else {
      event.currentTarget.style.transition = "";
      event.currentTarget.style.transform = "";
    }
  };

  return (
    <dialog
      ref={dialog}
      className={leaving ? "welcome welcome-leaving" : "welcome"}
      aria-label={`${WELCOME.name}: ${WELCOME.subtitle}`}
      tabIndex={-1}
      onCancel={onCancel}
      onKeyDown={onKeyDown}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <img className="welcome-image" src={`/assets/welcome/${WELCOME.image.file}`} alt="" draggable={false} />
      <div className="welcome-content" ref={content}>
        <header>
          <h2 className="welcome-title">{WELCOME.name}</h2>
          <p className="welcome-subtitle">{WELCOME.subtitle}</p>
        </header>
        <section className="welcome-team">
          <h3 className="welcome-label">Research team</h3>
          <ul>
            {WELCOME.team.map(({ name, photo, address, label }) => (
              <li key={name}>
                <a
                  href={address}
                  aria-label={label}
                  title={address.replace(/^mailto:/, "")}
                  {...(address.startsWith("mailto:") ? {} : { target: "_blank", rel: "noreferrer" })}
                >
                  <img className="welcome-avatar" src={`/assets/welcome/${photo}`} alt="" draggable={false} />
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
            <img src="/assets/welcome/signature.png" alt="" draggable={false} />
            <span className="welcome-name">{WELCOME.developer.name}</span>
          </a>
        </section>
        <section className="welcome-visits">
          <h3 className="welcome-label">Recorded page visits</h3>
          <p role="status">{totalWords(total)}</p>
        </section>
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
                  <img src={`/assets/welcome/${file}`} alt={name} draggable={false} />
                </a>
              </li>
            ))}
          </ul>
        </footer>
      </div>
      <p className="welcome-credit">{WELCOME.image.credit}</p>
      <button
        type="button"
        className="welcome-enter"
        aria-label="Enter Lynkeus"
        title="Slide up to enter"
        onClick={enter}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <polyline points="5,13 12,6 19,13" />
          <polyline points="5,20 12,13 19,20" />
        </svg>
      </button>
    </dialog>
  );
}
