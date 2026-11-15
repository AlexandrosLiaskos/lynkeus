"""The tools of the group Backscatter. They read the diagonal terms of GCOV products.

A diagonal term (``HHHH``, ``HVHV``, ``VHVH``, ``VVVV``, ``RHRH`` or ``RVRV``) is the radar backscatter gamma0
of one polarisation channel, in linear power. The method sheets are ``docs/methods/backscatter-state.md`` and
``docs/methods/backscatter-change.md``.
"""

import re
from collections.abc import Sequence

import numpy as np
from numpy.typing import NDArray

from lynkeus.analysis.inputs import check_inputs
from lynkeus.layers import AnalysisResult, LayerDescription, Reduction
from lynkeus.writing import LayerError

# The diagonal terms of the covariance matrix that a GCOV product can hold (NASA SDS Product Specification, L2 GCOV,
# JPL D-102274 Rev F, Table 5-3).
_TERMS = re.compile(r"HHHH|HVHV|VHVH|VVVV|RHRH|RVRV")
_READS = "a diagonal covariance term (HHHH, HVHV, VHVH, VVVV, RHRH or RVRV)"

_STATE_METHOD = (
    "10*log10 of the covariance term, the conversion that the product states in its field "
    "outputBackscatterDecibelConversionFormula (NASA SDS Product Specification, L2 GCOV, JPL D-102274 Rev F, Table 5-7)"
)
_CHANGE_METHOD = (
    "Ratio of the backscatter of two dates, in decibels (Rignot and van Zyl, 1993, https://doi.org/10.1109/36.239913)"
)


def _decibels(power: NDArray[np.float32]) -> NDArray[np.float32]:
    """Return ``10 * log10(power)``, in dB, with ``nan`` where the power is not a finite number above zero."""
    decibels = np.full(power.shape, np.nan, np.float32)
    np.log10(power, out=decibels, where=(power > 0) & (power < np.inf))
    decibels *= 10
    return decibels


def _valid(values: NDArray[np.float32]) -> NDArray[np.float32]:
    """Return the cells of a result that hold a value.

    Raises
    ------
    LayerError
        If no cell holds a value.
    """
    valid = values[~np.isnan(values)]
    if valid.size == 0:
        raise LayerError("The result would hold no value in any cell.")
    return valid


def _result(
    values: NDArray[np.float32],
    quantity: str,
    lowest: float,
    highest: float,
    colours: str,
    method: str,
    reduction: Reduction,
) -> AnalysisResult:
    """Return a result in decibels, with its legend from ``lowest`` to ``highest``.

    Raises
    ------
    LayerError
        If ``lowest`` is not below ``highest``.
    """
    if not lowest < highest:
        raise LayerError("The values of the result are too alike to give the legend a range.")
    return AnalysisResult(values, quantity, "dB", (lowest, highest), colours, method, reduction)


def backscatter_state(arrays: Sequence[NDArray[np.float32]], layers: Sequence[LayerDescription]) -> AnalysisResult:
    """Convert the radar backscatter of one date from linear power to decibels.

    Parameters
    ----------
    arrays : sequence of numpy.ndarray
        One array: a diagonal covariance term of a GCOV product, gamma0 in linear power (unit ``1``).
    layers : sequence of LayerDescription
        The description of that layer.

    Returns
    -------
    AnalysisResult
        gamma0 in decibels (dB): ``10 * log10`` of the input. A cell holds ``nan`` where the input is ``nan``,
        zero, negative or infinite. The legend runs from the 5th to the 95th percentile of the result, in dB,
        on the grey scale. The reduced copies of the result are the decibels of the mean power, so that a
        reduced copy of the result is the conversion of the reduced copy of the input.

    Raises
    ------
    LayerError
        If the input is not one diagonal covariance term of a GCOV product (see ``check_inputs``), holds no
        value above zero, or gives a legend without a range.
    """
    check_inputs(arrays, layers, count=1, product="GCOV", names=_TERMS, reads=_READS, dates=1)
    decibels = _decibels(arrays[0])
    lowest, highest = np.quantile(_valid(decibels), [0.05, 0.95])
    return _result(
        decibels, "Radar backscatter gamma0", float(lowest), float(highest), "grey", _STATE_METHOD, "mean-power"
    )


def backscatter_change(arrays: Sequence[NDArray[np.float32]], layers: Sequence[LayerDescription]) -> AnalysisResult:
    """Map the change of the radar backscatter between two dates, in decibels.

    Parameters
    ----------
    arrays : sequence of numpy.ndarray
        Two arrays on the same grid: the same diagonal covariance term of two GCOV products of the same
        instrument, track, direction and frame, gamma0 in linear power (unit ``1``). The earlier date comes
        first.
    layers : sequence of LayerDescription
        The descriptions of the two layers, in the same order.

    Returns
    -------
    AnalysisResult
        Change of gamma0 in decibels (dB): ``10 * log10(later / earlier)``. A positive value is an increase. A
        cell holds ``nan`` where either input is ``nan``, zero, negative or infinite, or where the ratio is
        beyond the range of 32-bit numbers. The legend runs from -r to +r, where r is the 99th percentile of
        the absolute values of the result, in dB, on the diverging scale ``RdBu``. The reduced copies of
        the result are means of its decibel values: the ratio of the mean powers of two dates cannot be
        derived from the result alone.

    Raises
    ------
    LayerError
        If the inputs are not two diagonal covariance terms of GCOV products (see ``check_inputs``), are not
        the same term, are not of the same instrument, track, direction and frame, or do not have the earlier
        date first; if no cell holds a value above zero on both dates; or if the legend has no range.
    """
    earlier, later = check_inputs(arrays, layers, count=2, product="GCOV", names=_TERMS, reads=_READS, dates=1)
    if layers[0].layer != layers[1].layer:
        raise LayerError(
            f"The two layers are not the same covariance term: "
            f"the first is {layers[0].layer} and the second is {layers[1].layer}."
        )
    if earlier != later:
        raise LayerError("The two layers are not of the same instrument, track, direction and frame.")
    if not layers[0].dates[0] < layers[1].dates[0]:
        raise LayerError("The first layer must be of an earlier date than the second.")
    before, after = arrays
    ratio = np.full(before.shape, np.nan, np.float32)
    with np.errstate(over="ignore", invalid="ignore"):
        np.divide(after, before, out=ratio, where=before > 0)
    change = _decibels(ratio)
    # A list of percentiles makes numpy interpolate in 64-bit numbers, as the source program does.
    (reach,) = np.quantile(np.abs(_valid(change)), [0.99])
    return _result(
        change, "Change of radar backscatter gamma0", -float(reach), float(reach), "RdBu", _CHANGE_METHOD, "mean"
    )
