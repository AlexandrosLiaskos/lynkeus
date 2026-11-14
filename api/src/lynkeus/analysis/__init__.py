"""The analysis tools of Lynkeus.

Every tool is one function. It receives the arrays of its input layers, in
the order that its method sheet gives, with their layer descriptions, and it
returns the array of the result with its quantity, unit, value range, colour
scale and method. A cell without data holds ``nan`` in every array. The
function reads no file, writes no file and contacts no service.

``TOOLS`` lists every finished tool under the name of its button, for example
``backscatter-change``. The server offers the tools of this list and no
others.
"""

from collections.abc import Callable, Sequence

import numpy as np
from numpy.typing import NDArray

from lynkeus.layers import AnalysisResult, LayerDescription

type AnalysisFunction = Callable[[Sequence[NDArray[np.float32]], Sequence[LayerDescription]], AnalysisResult]

TOOLS: dict[str, AnalysisFunction] = {}
