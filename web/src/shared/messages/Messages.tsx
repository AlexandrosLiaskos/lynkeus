import { useEffect, useState } from "react";
import { Icon } from "../icon/Icon";
import { useStore } from "../store";
import { dismiss, messagesStore, type Message } from "./messages";

/** The time after which a message of success or a notice leaves the page, in milliseconds. */
export const MESSAGE_TIME = 8000;

/**
 * One message, as an alert of the U.S. Web Design System. A warning or an error stays until the user closes it. A message of success or a notice leaves by
 * itself, but not while the pointer or the keyboard focus rests on it.
 */
function MessageItem({ message: { id, kind, text } }: { message: Message }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const resting = hovered || focused;
  const leaves = kind === "success" || kind === "info";

  useEffect(() => {
    if (!leaves || resting) {
      return;
    }
    const timer = window.setTimeout(() => dismiss(id), MESSAGE_TIME);
    return () => window.clearTimeout(timer);
  }, [leaves, resting, id]);

  return (
    <div
      className={`usa-alert usa-alert--${kind} usa-alert--slim message`}
      role={kind === "error" ? "alert" : "status"}
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
    </div>
  );
}

/** The place of the page that shows the messages, over the foot of the map. */
export function Messages() {
  const messages = useStore(messagesStore);
  return (
    <div className="messages">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </div>
  );
}
