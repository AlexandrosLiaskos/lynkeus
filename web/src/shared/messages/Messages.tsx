// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { AnimatePresence, m, useIsPresent } from "motion/react";
import { useEffect, useState } from "react";
import { Icon } from "../icon/Icon";
import { MotionRoot } from "../motion/MotionRoot";
import { useStore } from "../store";
import { EASE_ENTER, EASE_EXIT, MOTION_ENTER, MOTION_EXIT } from "../tokens/motion";
import { dismiss, messagesStore, type Message } from "./messages";

/** The time after which a message of success or a notice leaves the page, in milliseconds. */
export const MESSAGE_TIME = 8000;

/** How far a message moves while it enters or leaves, in pixels. It comes from the foot of the map. */
const MESSAGE_SHIFT = 8;

const ENTERED = { opacity: 1, y: 0, transition: { duration: MOTION_ENTER, ease: EASE_ENTER } };
const BEFORE = { opacity: 0, y: MESSAGE_SHIFT };
const LEFT = { opacity: 0, y: MESSAGE_SHIFT, transition: { duration: MOTION_EXIT, ease: EASE_EXIT } };

/**
 * One message, as an alert of the U.S. Web Design System. A warning or an error stays until the user closes it. A message of success or a notice leaves by
 * itself, but not while the pointer or the keyboard focus rests on it.
 *
 * The message fades in while it rises a little, and fades out while it sinks. From the moment it starts to leave
 * it is `inert` and hidden from a screen reader, so its close button cannot hold the keyboard focus.
 */
function MessageItem({ message: { id, kind, text } }: { message: Message }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const resting = hovered || focused;
  const leaves = kind === "success" || kind === "info";
  const present = useIsPresent();

  useEffect(() => {
    if (!leaves || resting) {
      return;
    }
    const timer = window.setTimeout(() => dismiss(id), MESSAGE_TIME);
    return () => window.clearTimeout(timer);
  }, [leaves, resting, id]);

  return (
    <m.div
      className={`usa-alert usa-alert--${kind} usa-alert--slim message`}
      role={kind === "error" ? "alert" : "status"}
      inert={!present}
      aria-hidden={present ? undefined : true}
      initial={BEFORE}
      animate={ENTERED}
      exit={LEFT}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <div className="usa-alert__body">
        <p className="usa-alert__text">{text}</p>
      </div>
      <button type="button" className="message-close" aria-label="Close this message" onClick={() => dismiss(id)}>
        <Icon name="close" size={3} />
      </button>
    </m.div>
  );
}

/** The place of the page that shows the messages, over the foot of the map. */
export function Messages() {
  const messages = useStore(messagesStore);
  return (
    <MotionRoot>
      <div className="messages">
        <AnimatePresence>
          {messages.map((message) => (
            <MessageItem key={message.id} message={message} />
          ))}
        </AnimatePresence>
      </div>
    </MotionRoot>
  );
}
