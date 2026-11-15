"""The thematic map of the group Backscatter: the wetland inundation classification of the NISAR science team.

The tool reads the layers ``HHHH`` and ``HVHV`` of one GCOV product, the radar backscatter gamma0 of the channels HH
and HV in linear power, and gives each cell one of three classes. It computes what the notebook
``notebooks/NISAR_L3_Inundation_ProductGeneration.ipynb`` of the repository NISAR_Inundation of the NISAR science
team computes in its Steps 4b to 6 (commit ``85140c4`` of 10 July 2026, Apache License 2.0), with the thresholds of
the set ``Default`` of its file ``ancillary_data/wetland_calibration_parameters.yaml``. The method sheet is
``docs/methods/backscatter-map.md``.
"""

import re
from collections.abc import Sequence

import numpy as np
from numpy.typing import NDArray

from lynkeus.analysis.inputs import check_inputs
from lynkeus.layers import AnalysisResult, LayerClass, LayerDescription
from lynkeus.writing import LayerError

# The thresholds of the set ``Default`` of ``ancillary_data/wetland_calibration_parameters.yaml`` at commit
# ``85140c4``, as the file writes them: ``open_water`` ``sum_min`` and ``sum_max``, and ``inun_veg_single_class``
# ``HH_min``, ``HH_max``, ``ratio_min`` and ``ratio_max``. They apply to gamma0 in linear power. The set ``Default``
# holds the numbers of the set ``Yucatan_Lake``, a calibration site of the mission.
OPEN_WATER_SUM_MIN = 0.0
OPEN_WATER_SUM_MAX = 0.06800000369548798
VEGETATION_HH_MIN = 0.42448979591836733
VEGETATION_HH_MAX = 10
VEGETATION_RATIO_MIN = 1.2000000000000002
VEGETATION_RATIO_MAX = 500

NOT_INUNDATED = 1
OPEN_WATER = 2
INUNDATED_VEGETATION = 3

CLASSES = (
    LayerClass(value=NOT_INUNDATED, name="Not inundated", colour="#ececee"),
    LayerClass(value=OPEN_WATER, name="Open water", colour="#151b73"),
    LayerClass(value=INUNDATED_VEGETATION, name="Inundated vegetation", colour="#42e9f5"),
)
"""The classes of the notebook, with the colours of its Step 7: (236, 236, 238), (21, 27, 115) and (66, 233, 245).

The notebook gives the value 0 to a cell without data; such a cell holds ``nan`` in the result.
"""

# The two layers of the group ``frequencyA`` that the notebook reads (its Step 3c), by the names that
# ``lynkeus.harmony.layers_of`` gives them.
_HH = re.compile(r"HHHH")
_HV = re.compile(r"HVHV")

_METHOD = (
    "Wetland inundation classification of the NISAR science team: Steps 4b to 6 of the notebook "
    "NISAR_L3_Inundation_ProductGeneration.ipynb of NISAR_Inundation, commit 85140c4, with the thresholds of the set "
    "Default of ancillary_data/wetland_calibration_parameters.yaml "
    "(https://github.com/NISAR-Science-Algorithms/NISAR_Inundation; NISAR Mission Science Users' Handbook, "
    "2nd edition, section 6.4, https://doi.org/10.48577/jpl.UD4HV3)"
)


def backscatter_map(arrays: Sequence[NDArray[np.float32]], layers: Sequence[LayerDescription]) -> AnalysisResult:
    """Classify each cell of one GCOV product as not inundated, open water or inundated vegetation.

    Parameters
    ----------
    arrays : sequence of numpy.ndarray
        Two arrays on the same grid, of one GCOV product. The first is the layer ``HHHH`` and the second the layer
        ``HVHV``: gamma0 of the channels HH and HV in linear power (unit ``1``).
    layers : sequence of LayerDescription
        The descriptions of the two layers, in the same order.

    Returns
    -------
    AnalysisResult
        The class of each cell, a number without unit (``1``): 1 not inundated, 2 open water and 3 inundated
        vegetation. The classes are those of the notebook, computed in 32-bit numbers as it computes them. With
        ``total = HHHH + HVHV`` and ``ratio = HHHH / HVHV``, a cell is 1 where ``total`` is above 0; it is 2 where
        ``total`` is above 0 and at most 0.068; it is 3 where it is not 2, ``HHHH`` is from 0.4245 to 10 and
        ``ratio`` is from 1.2 to 500. A cell holds ``nan`` where the notebook gives the value 0, no data: where
        ``total`` is not above 0, and where either layer is ``nan``. The result carries the three classes with the
        colours of the notebook, its range runs from 1 to 3, and its reduced copies take the most frequent class.

    Raises
    ------
    LayerError
        If the number of layers is not two; if the first is not a layer ``HHHH`` and the second not a layer
        ``HVHV`` of a GCOV product (see ``check_inputs``); if the two layers do not have the same grid or are not of
        the same product file; or if no cell holds a class.
    ValueError
        If the arrays and the descriptions differ in number, or an array is not two-dimensional 32-bit floating
        point. These are faults of the caller.
    """
    if len(arrays) != len(layers):
        raise ValueError("The arrays and the descriptions of the input layers differ in number.")
    if len(layers) != 2:
        raise LayerError(f"The number of input layers must be 2, and it is {len(layers)}.")
    check_inputs(arrays[:1], layers[:1], count=1, product="GCOV", names=_HH, reads="the layer HHHH", dates=1)
    check_inputs(arrays[1:], layers[1:], count=1, product="GCOV", names=_HV, reads="the layer HVHV", dates=1)
    hh, hv = arrays
    if hv.shape != hh.shape:
        raise LayerError("The input layers do not have the same grid.")
    if layers[0].inputs != layers[1].inputs:
        raise LayerError("The two layers are not of the same product file.")
    # Step 4b of the notebook: the ratio and the sum of the two layers, in 32-bit numbers. A ratio by zero is
    # infinite or nan, as it is in the notebook, and no threshold accepts it.
    with np.errstate(divide="ignore", invalid="ignore", over="ignore"):
        ratio = hh / hv
        total = hh + hv
    # Step 6 of the notebook, in its order. A 32-bit array is compared with each threshold in 32-bit numbers, as
    # the notebook compares it; a comparison with nan is false, so such a cell keeps the value 0.
    classes = np.zeros(hh.shape, np.uint8)
    classes[total > 0] = NOT_INUNDATED
    classes[(total > OPEN_WATER_SUM_MIN) & (total <= OPEN_WATER_SUM_MAX)] = OPEN_WATER
    vegetation = (hh >= VEGETATION_HH_MIN) & (hh <= VEGETATION_HH_MAX)
    vegetation &= (ratio >= VEGETATION_RATIO_MIN) & (ratio <= VEGETATION_RATIO_MAX)
    classes[vegetation & (classes != OPEN_WATER)] = INUNDATED_VEGETATION
    if not classes.any():
        raise LayerError("The result would hold no value in any cell.")
    values = classes.astype(np.float32)
    values[classes == 0] = np.nan
    return AnalysisResult(
        values,
        "Wetland inundation class",
        "1",
        (float(CLASSES[0].value), float(CLASSES[-1].value)),
        "classes",
        _METHOD,
        "mode",
        classes=CLASSES,
    )
