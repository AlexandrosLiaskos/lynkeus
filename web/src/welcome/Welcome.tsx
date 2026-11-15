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

/** The time that the screen takes to slide away, in milliseconds. The style of the screen names the same time. */
export const SLIDE_TIME = 700;

/** How far upward a drag must go to open the page, in pixels. */
const DRAG_LIMIT = 80;

/** How far the pointer may move between its press and its release for the two to count as a click, in pixels. */
const CLICK_LIMIT = 6;

/** Tell whether an event began on a link, a button or the note of the image, which then keeps its own meaning. */
function onControl(target: EventTarget): boolean {
  return target instanceof Element && target.closest("a, button, .welcome-credit") !== null;
}

/**
 * Tell whether a key opens the page. Enter, Space, the arrows and the keys that write a character do. The Tab
 * key moves between the links, and a key held with Control, Alt or the Meta key is a command of the browser.
 */
function opens(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return false;
  }
  return event.key.length === 1 || ["Enter", "ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key);
}

interface WelcomeProps {
  /** Count the visit. A test gives its own. */
  count?: () => Promise<number>;
}

/**
 * The welcome screen, which covers the page when it opens, as the lock screen of a computer covers the desktop.
 * It shows an illustration of the NISAR satellite and, in its lower right part, the mark and the name of the
 * platform, the team, the event for which Lynkeus was started with the logos of its organisers and of the
 * universities of the team. Every member, the event and every logo is a link. A small letter i in the lower left
 * corner names the source of the image.
 *
 * The visitor enters as on the lock screen of a computer, by any of the first things a visitor tries: a click or a
 * tap anywhere on the screen, the button at the middle of its foot, a drag upward, a scroll, or a key. The screen
 * then moves up out of the window and the page stands under it. Until the visitor touches it, the screen lifts a
 * little every few seconds and shows the edge of the page under it, so that nobody takes it for the whole site.
 *
 * It is the dialog element of the browser, opened as a modal, so the browser keeps the keyboard focus inside it
 * until the visitor enters.
 */
export function Welcome({ count = visits }: WelcomeProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  // The height of the pointer where a drag began, and null while nothing is dragged.
  const drag = useRef<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  // Whether the screen still lifts a little now and then, which it does until the visitor touches it.
  const [hinting, setHinting] = useState(true);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) {
      element.showModal();
      element.focus();
    }
  }, []);

  // The visit is counted once for each browser. The screen does not show the total, so a counter that does not
  // answer changes nothing here.
  useEffect(() => {
    count().catch(() => undefined);
  }, [count]);

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
    if (opens(event) && !onControl(event.target)) {
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
      setHinting(false);
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

  // A drag upward that went far enough opens the page, and so does a click, which hardly moves the pointer. A
  // shorter drag lets the screen return.
  const onPointerEnd = (event: PointerEvent<HTMLDialogElement>) => {
    if (drag.current === null) {
      return;
    }
    const moved = drag.current - event.clientY;
    drag.current = null;
    if (moved > DRAG_LIMIT || (event.type === "pointerup" && Math.abs(moved) <= CLICK_LIMIT)) {
      enter();
    } else {
      event.currentTarget.style.transition = "";
      event.currentTarget.style.transform = "";
    }
  };

  return (
    <dialog
      ref={dialog}
      className={leaving ? "welcome welcome-leaving" : hinting ? "welcome welcome-hinting" : "welcome"}
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
        <header className="welcome-head">
          <img className="welcome-mark" src="/assets/lynkeus-mark-white.svg" alt="" draggable={false} />
          <div>
            <h2 className="welcome-title">{WELCOME.name}</h2>
            <p className="welcome-subtitle">{WELCOME.subtitle}</p>
          </div>
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
        <section className="welcome-event">
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
        </section>
      </div>
      <span className="welcome-credit" tabIndex={0} role="note" aria-label={WELCOME.image.credit}>
        <span aria-hidden="true">i</span>
        <span className="welcome-credit-text">{WELCOME.image.credit}</span>
      </span>
      <button type="button" className="welcome-enter" onClick={enter}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <polyline points="5,13 12,6 19,13" />
          <polyline points="5,20 12,13 19,20" />
        </svg>
        <span>{WELCOME.enter}</span>
      </button>
    </dialog>
  );
}
