"""The analysis tools of Lynkeus.

Every tool is one function. It receives the arrays of its input layers, in
the order that its method sheet gives, with their layer descriptions, and it
returns the array of the result with its quantity, unit, value range, colour
scale and method. A cell without data holds ``nan`` in every array. The
function reads no file, writes no file and contacts no service.

``TOOLS`` lists every finished tool under the name of its button, for example
``backscatter-change``. The server offers the tools of this list and no
others. A tool that refuses its input layers raises
``lynkeus.writing.LayerError``, whose message is one sentence for the visitor.

A tool of the kind Series returns no array. It receives the arrays one after
another, with the cell of a point or no cell for the whole area, and it
returns one value for each layer. ``SERIES_TOOLS`` lists every finished tool
of this kind, and the server offers them as it offers the tools of ``TOOLS``.
"""

from collections.abc import Callable, Iterable, Sequence

import numpy as np
from numpy.typing import NDArray

from lynkeus.analysis.backscatter import backscatter_change, backscatter_state
from lynkeus.analysis.coherence import coherence_state
from lynkeus.analysis.series import backscatter_series, coherence_series
from lynkeus.layers import AnalysisResult, LayerDescription, SeriesResult

type AnalysisFunction = Callable[[Sequence[NDArray[np.float32]], Sequence[LayerDescription]], AnalysisResult]

TOOLS: dict[str, AnalysisFunction] = {
    "backscatter-state": backscatter_state,
    "backscatter-change": backscatter_change,
    "coherence-state": coherence_state,
}

type SeriesFunction = Callable[
    [Iterable[NDArray[np.float32]], Sequence[LayerDescription], tuple[int, int] | None], SeriesResult
]

SERIES_TOOLS: dict[str, SeriesFunction] = {
    "backscatter-series": backscatter_series,
    "coherence-series": coherence_series,
}
