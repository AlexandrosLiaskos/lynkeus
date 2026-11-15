# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
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
