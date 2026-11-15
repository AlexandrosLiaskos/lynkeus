# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Lynkeus Server, the program that a visitor runs on a computer of his own.

The program connects the computer to Lynkeus (``lynkeus.link``): the jobs of its owner then run on
it, and their layers are kept in its data folder. It shows a small window with the code of the
pairing, whether the computer is connected, the jobs and the space used. Started with
``--no-window`` it writes the same on the terminal, for a server without a screen::

    python -m lynkeus.ownserver --no-window
"""

import argparse
import io
import logging
import multiprocessing
import signal
import sys
import threading
import webbrowser
from collections.abc import Sequence
from logging.handlers import RotatingFileHandler
from pathlib import Path

from lynkeus import OTHER_MAP_DATA, __version__, computer
from lynkeus.link import PROJECT_SERVER, Link, View
from lynkeus.offered import processes

NAME = "Lynkeus Server"
"""The name of the program."""

REFRESH = 0.5
"""The time between two looks of the program at its state, in seconds."""

LOG_SIZE = 1_000_000
"""The size at which the log file is closed and a new one is started, in bytes. One closed file is kept."""

STATES = {"running": "Running", "accepted": "Waiting"}
"""The state of a job that runs or waits, as the program names it."""


def size_text(size: int) -> str:
    """Write a number of bytes with the unit that suits it, for example ``1.5 GB``. A unit is 1000 of the one before."""
    units = ("bytes", "kB", "MB", "GB", "TB")
    amount, index = float(size), 0
    while amount >= 1000 and index < len(units) - 1:
        amount, index = amount / 1000, index + 1
    return f"{amount:.0f} {units[index]}" if index == 0 or amount >= 100 else f"{amount:.3g} {units[index]}"


def connection_text(view: View) -> str:
    """Say in one sentence whether the computer is connected to Lynkeus, and to which Earthdata user."""
    if view.paired and view.connected:
        return f"Connected to Lynkeus as {view.user}." if view.user else "Connected to Lynkeus."
    if view.code is not None and view.connected:
        return "Not connected yet. Confirm the code on the site of Lynkeus."
    return f"Not connected. {view.problem or 'Lynkeus Server is asking the project server.'}"


def space_text(view: View) -> str:
    """Say in one sentence how much space the layers use, and how much they may use."""
    layers = "1 layer" if view.layers == 1 else f"{view.layers} layers"
    allowed = "" if view.storage is None else f" of {size_text(view.storage)}"
    return f"Space used: {size_text(view.used)}{allowed}, in {layers}."


def jobs_text(view: View) -> str:
    """Say in one sentence how many jobs run and how many wait."""
    running = sum(job.status == "running" for job in view.jobs)
    return f"Jobs: {running} running, {len(view.jobs) - running} waiting."


def lines(view: View) -> list[str]:
    """Write what the program shows as lines for the terminal.

    The lines hold no progress in percent, so that a line changes only when a job passes to another step.
    """
    written = [f"{NAME} {view.version}", f"Data folder: {view.folder}"]
    if view.code is not None:
        written.append(
            f"To connect this computer, open {view.complete} in a browser, sign in to Earthdata "
            f"and confirm the code {view.code}."
        )
    written.append(connection_text(view))
    if view.paired:
        written.append(jobs_text(view))
        written += [f"  {STATES.get(job.status, job.status)}: {job.title}. {job.message}" for job in view.jobs]
        written.append(space_text(view))
    return written


def site_address(view: View) -> str:
    """Return the address that the command Open Lynkeus opens: that of the pairing while one waits, else the site.

    An address that does not belong to the project server is never opened.
    """
    site = f"{view.site}/"
    return view.complete if view.complete is not None and view.complete.startswith(site) else site


def _arguments(given: Sequence[str] | None) -> argparse.Namespace:
    """Read the arguments of the command line."""
    parser = argparse.ArgumentParser(
        prog="lynkeus-server",
        description="Connects this computer to Lynkeus, so that the jobs of its owner run on it "
        "and their layers are kept on its disk.",
    )
    parser.add_argument("--no-window", action="store_true", help="write on the terminal and open no window")
    parser.add_argument(
        "--server", default=PROJECT_SERVER, metavar="ADDRESS", help="address of the project server (%(default)s)"
    )
    parser.add_argument(
        "--data-folder", type=Path, default=None, metavar="FOLDER", help=f"data folder ({computer.data_folder()})"
    )
    parser.add_argument("--version", action="version", version=f"{NAME} {__version__}")
    return parser.parse_args(given)


def _record_in(folder: Path, terminal: bool) -> None:
    """Record what the program does and every error in the log file of the data folder, and on the terminal."""
    file = RotatingFileHandler(folder / computer.LOG, maxBytes=LOG_SIZE, backupCount=1, encoding="utf-8")
    file.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    handlers: list[logging.Handler] = [file]
    if terminal:
        errors = logging.StreamHandler()
        errors.setLevel(logging.ERROR)
        handlers.append(errors)
    logging.basicConfig(level=logging.INFO, handlers=handlers, force=True)


def run_on_terminal(link: Link, stop: threading.Event) -> None:
    """Write the state of the server on the terminal, each line when it changes, until ``stop`` is set."""
    shown: list[str] = []
    while True:
        present = lines(link.view())
        for line in present:
            if line not in shown:
                print(line, flush=True)
        shown = present
        if stop.wait(REFRESH):
            return


def _terminal(link: Link) -> int:
    """Run the server on the terminal until the program is interrupted or asked to end."""
    stop = threading.Event()
    for name in ("SIGINT", "SIGTERM", "SIGBREAK"):
        if hasattr(signal, name):
            signal.signal(getattr(signal, name), lambda number, frame: stop.set())
    # A terminal that cannot show a character of a title or of a folder name shows a question mark for it.
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(errors="replace")
    print(f"{NAME} runs. Press Ctrl+C to quit.", flush=True)
    link.start()
    try:
        run_on_terminal(link, stop)
    finally:
        print("Ending the jobs and quitting.", flush=True)
        link.stop()
    return 0


def _window(link: Link, opens_browser: bool) -> int:
    """Run the server with its window until the user quits.

    Parameters
    ----------
    link : Link
        The server.
    opens_browser : bool
        Whether the address of the first pairing is opened in the browser as soon as it is known.
    """
    import tkinter as tk  # the window is not needed, and may not exist, on a server without a screen
    from tkinter import messagebox, ttk

    root = tk.Tk()
    root.title(NAME)
    root.minsize(520, 380)
    frame = ttk.Frame(root, padding=16)
    frame.pack(fill="both", expand=True)
    connection = ttk.Label(frame, font=("TkDefaultFont", 11, "bold"), wraplength=480, justify="left")
    connection.pack(anchor="w")
    hint = ttk.Label(frame, wraplength=480, justify="left")
    hint.pack(anchor="w", pady=(8, 0))
    code = ttk.Label(frame, font=("TkFixedFont", 24, "bold"))
    code.pack(anchor="w", pady=(4, 8))
    summary = ttk.Label(frame)
    summary.pack(anchor="w")
    table = ttk.Treeview(frame, columns=("state", "progress", "step"), height=6, selectmode="none")
    for column, title, width in (
        ("#0", "Job", 200),
        ("state", "State", 70),
        ("progress", "Done", 50),
        ("step", "Step", 220),
    ):
        table.heading(column, text=title, anchor="w")
        table.column(column, width=width, anchor="w")
    table.pack(fill="both", expand=True, pady=(4, 8))
    space = ttk.Label(frame)
    space.pack(anchor="w")
    buttons = ttk.Frame(frame)
    buttons.pack(fill="x", pady=(12, 0))
    opened = [not opens_browser]
    asked_to_end = threading.Event()
    # A signal of the system, at the end of the session of the user for example, ends the program as Quit does.
    for name in ("SIGINT", "SIGTERM", "SIGBREAK"):
        if hasattr(signal, name):
            signal.signal(getattr(signal, name), lambda number, frame: asked_to_end.set())

    def refresh() -> None:
        if asked_to_end.is_set():
            root.destroy()
            return
        view = link.view()
        connection.configure(text=connection_text(view))
        if view.code is not None:
            hint.configure(text=f"Open {view.address}, sign in to Earthdata and confirm this code:")
            code.configure(text=view.code)
            if not opened[0]:
                opened[0] = True
                webbrowser.open(site_address(view))
        else:
            hint.configure(text=f"Version {view.version}. Data folder: {view.folder}")
            code.configure(text="")
        summary.configure(text=jobs_text(view) if view.paired else "")
        table.delete(*table.get_children())
        for job in view.jobs:
            values = (STATES.get(job.status, job.status), f"{job.progress} %", job.message)
            table.insert("", "end", text=job.title, values=values)
        space.configure(text=space_text(view) if view.paired else "")
        root.after(int(REFRESH * 1000), refresh)

    def quit_program() -> None:
        unfinished = len(link.view().jobs)
        if unfinished:
            jobs = "1 job runs or waits" if unfinished == 1 else f"{unfinished} jobs run or wait"
            question = f"{jobs} on this computer. Quitting ends them, and they must be started again. Quit?"
            if not messagebox.askokcancel(NAME, question, parent=root):
                return
        root.destroy()

    ttk.Button(buttons, text="Open Lynkeus", command=lambda: webbrowser.open(site_address(link.view()))).pack(
        side="left"
    )
    ttk.Button(buttons, text="Open the data folder", command=lambda: webbrowser.open(link.folder.as_uri())).pack(
        side="left", padx=8
    )
    ttk.Button(buttons, text="Quit", command=quit_program).pack(side="right")
    root.protocol("WM_DELETE_WINDOW", quit_program)
    if sys.platform == "darwin":
        root.createcommand("tk::mac::Quit", quit_program)
    link.start()
    refresh()
    try:
        root.mainloop()
    finally:
        link.stop()
    return 0


def _tell(sentence: str, window: bool) -> None:
    """Give the user one sentence before the program ends: in a dialog, or on the terminal."""
    if window:
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        messagebox.showinfo(NAME, sentence, parent=root)
        root.destroy()
    else:
        print(sentence, file=sys.stderr, flush=True)


def main(given: Sequence[str] | None = None) -> int:
    """Run Lynkeus Server with the arguments of the command line, and return its exit code.

    The exit code is 0 after the user quit, 1 when another Lynkeus Server runs on the data folder and
    2 when an argument is not valid.
    """
    arguments = _arguments(given)
    window = not arguments.no_window
    folder: Path = arguments.data_folder or computer.data_folder()
    try:
        folder.mkdir(parents=True, exist_ok=True)
        link = Link(folder, processes(), arguments.server)
    except computer.AlreadyRunningError as error:
        _tell(str(error), window)
        return 1
    except ValueError as error:
        _tell(f"Lynkeus Server cannot start: {error}.", window)
        return 2
    except OSError:
        _tell(f"Lynkeus Server cannot use the data folder {folder}.", window)
        return 2
    _record_in(folder, terminal=not window)
    logging.getLogger(__name__).info("%s %s started on the data folder %s.", NAME, __version__, folder)
    if OTHER_MAP_DATA:
        logging.getLogger(__name__).info(
            "The computer names map data of other programs in %s. The program uses its own.", ", ".join(OTHER_MAP_DATA)
        )
    if not window:
        return _terminal(link)
    return _window(link, opens_browser=not link.view().paired)


if __name__ == "__main__":
    multiprocessing.freeze_support()
    sys.exit(main())
