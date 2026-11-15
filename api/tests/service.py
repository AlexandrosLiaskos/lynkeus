"""The web service with the stand-in processes of the tests, as a program of its own.

``python -m tests.service <folder>`` runs the web service on a free port of this computer and writes
the number of the port as its first line. A test starts it to stop a whole process with a signal, as
the container of the web service is stopped.
"""

import socket
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI

from lynkeus.routes import install
from lynkeus.server_routes import install_servers
from tests.standin import SIGNED_IN, STAND_IN, key_server


def main() -> None:
    """Run the web service on the folder that the command names, until the process is told to stop."""
    with key_server() as keys:
        app = FastAPI()
        install(app, [STAND_IN, SIGNED_IN], folder=Path(sys.argv[1]), keys_address=keys.address, secure_cookie=False)
        install_servers(app)
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        print(listener.getsockname()[1], flush=True)
        uvicorn.Server(uvicorn.Config(app, log_level="info")).run(sockets=[listener])


if __name__ == "__main__":
    main()
