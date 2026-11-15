# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
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
another, with the place of the series: the cell of a point, the cells inside
an area drawn on the map, or no place for the whole area, and the cell of a
reference point or no cell. It returns one value for each date.
``SERIES_TOOLS`` lists every finished tool of this kind, and the server offers
them as it offers the tools of ``TOOLS``. Only ``displacement-series`` takes a
reference point, and it needs one.
"""

from collections.abc import Callable, Iterable, Sequence

import numpy as np
from numpy.typing import NDArray

from lynkeus.analysis.backscatter import backscatter_change, backscatter_state
from lynkeus.analysis.coherence import coherence_change, coherence_state
from lynkeus.analysis.displacement import displacement_series, displacement_state
from lynkeus.analysis.series import Place, backscatter_series, coherence_series, soil_moisture_series
from lynkeus.analysis.soil_moisture import soil_moisture_change, soil_moisture_state
from lynkeus.layers import AnalysisResult, LayerDescription, SeriesResult

type AnalysisFunction = Callable[[Sequence[NDArray[np.float32]], Sequence[LayerDescription]], AnalysisResult]

TOOLS: dict[str, AnalysisFunction] = {
    "backscatter-state": backscatter_state,
    "backscatter-change": backscatter_change,
    "coherence-state": coherence_state,
    "coherence-change": coherence_change,
    "displacement-state": displacement_state,
    "soil-moisture-state": soil_moisture_state,
    "soil-moisture-change": soil_moisture_change,
}

type SeriesFunction = Callable[
    [Iterable[NDArray[np.float32]], Sequence[LayerDescription], Place, tuple[int, int] | None],
    SeriesResult,
]

SERIES_TOOLS: dict[str, SeriesFunction] = {
    "backscatter-series": backscatter_series,
    "coherence-series": coherence_series,
    "displacement-series": displacement_series,
    "soil-moisture-series": soil_moisture_series,
}
