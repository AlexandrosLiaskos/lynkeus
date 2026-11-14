import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../shared/icon/Icon";
import { report } from "../shared/messages/messages";
import { formatScale, parseScale, SCALES } from "./scale";

interface ScaleControlProps {
  /** The number n of the scale 1 : n that the map shows. */
  scale: number;
  /** Called with the number n of the scale 1 : n that the user typed or chose from the list. */
  onChoose: (scale: number) => void;
}

/**
 * The scale of the map, in a field that also sets it. The user types a scale and presses Enter, or chooses one
 * from the list. The field and its list follow the combobox of the ARIA Authoring Practices Guide: the keyboard
 * focus stays in the field, the arrow keys move through the list, Enter chooses and Escape closes the list.
 */
export function ScaleControl({ scale, onChoose }: ScaleControlProps) {
  const id = useId();
  const listId = `${id}-list`;
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  // The text that the user is typing, or null while the field shows the scale of the map.
  const [typed, setTyped] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // The place in the list of the option that the arrow keys have reached, or -1.
  const [active, setActive] = useState(-1);
  const optionId = (index: number) => `${id}-option-${String(index)}`;

  // While the field has the keyboard focus and shows the scale of the map, its text is selected, so that typing
  // replaces the scale and does not add to it.
  const shown = formatScale(scale);
  useEffect(() => {
    if (typed === null && document.activeElement === field.current) {
      field.current?.select();
    }
  }, [typed, shown]);

  // The option that the arrow keys have reached stays in sight when the list is taller than its place.
  useEffect(() => {
    const option = list.current?.children[active];
    if (option instanceof HTMLElement) {
      option.scrollIntoView({ block: "nearest" });
    }
  }, [active]);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const choose = (chosen: number) => {
    close();
    setTyped(null);
    onChoose(chosen);
  };

  const enter = () => {
    const option = open ? SCALES[active] : undefined;
    const read = option ?? (typed === null ? undefined : parseScale(typed));
    if (read === undefined) {
      close();
    } else if (read === null) {
      report("error", `"${typed ?? ""}" is not a scale. Write a scale as 1:25,000 or as 25000.`);
      close();
      setTyped(null);
    } else {
      choose(read);
    }
  };

  const move = (step: 1 | -1) => {
    const first = step === 1 ? 0 : SCALES.length - 1;
    setActive(open && active >= 0 ? (active + step + SCALES.length) % SCALES.length : first);
    setOpen(true);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (event.altKey) {
          setOpen(true);
        } else {
          move(1);
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (event.altKey) {
          close();
        } else {
          move(-1);
        }
        break;
      case "Enter":
        event.preventDefault();
        enter();
        break;
      case "Escape":
        if (open) {
          close();
        } else {
          setTyped(null);
        }
        break;
    }
  };

  return (
    <span className="statusbar-item statusbar-scale">
      <label className="statusbar-label" htmlFor={id}>
        Scale
      </label>
      <span className="statusbar-scale-box">
        <input
          ref={field}
          id={id}
          className="statusbar-scale-field"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="none"
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={typed ?? shown}
          onChange={(event) => setTyped(event.target.value)}
          onFocus={(event) => event.target.select()}
          onBlur={() => {
            close();
            setTyped(null);
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="statusbar-scale-open"
          tabIndex={-1}
          aria-label="Scales"
          aria-expanded={open}
          aria-controls={listId}
          // The field keeps the keyboard focus when the button is pressed.
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            field.current?.focus();
            if (open) {
              close();
            } else {
              setOpen(true);
            }
          }}
        >
          <Icon name="expand_more" />
        </button>
        <ul ref={list} id={listId} className="statusbar-scale-list" role="listbox" aria-label="Scales" hidden={!open}>
          {SCALES.map((option, index) => (
            <li
              key={option}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              {formatScale(option)}
            </li>
          ))}
        </ul>
      </span>
    </span>
  );
}
