"""The start of the packed program Lynkeus Server.

PyInstaller packs this file as the program. A job runs in a new process of the same program, which
``multiprocessing.freeze_support`` turns into the job before anything else is done.
"""

import multiprocessing
import sys

from lynkeus.ownserver import main

if __name__ == "__main__":
    multiprocessing.freeze_support()
    sys.exit(main())
