# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Tests of the tool Surface displacement, Series."""

import math
from datetime import date, timedelta
from typing import Any

import numpy as np
import pytest
from numpy.typing import NDArray

from lynkeus.analysis import SERIES_TOOLS
from lynkeus.analysis.displacement import (
    DAYS_PER_YEAR,
    RCOND,
    SPEED_OF_LIGHT,
    displacement_series,
)
from lynkeus.analysis.series import backscatter_series, coherence_series
from lynkeus.layers import Area, Cell, LayerDescription, Point, Reference, SeriesDescription
from lynkeus.writing import LayerError

from .layers import COHERENCE, GCOV_2_NOV, GCOV_21_OCT, grid, layer

NAN = float("nan")
PHASE = "unwrappedInterferogram/HH/unwrappedPhase"
COMPONENTS = "unwrappedInterferogram/HH/connectedComponents"
# The centre frequency that the ISO XML files of the products of the pilot area state, in hertz.
FREQUENCY = 1239000000.0
FACTOR = -(SPEED_OF_LIGHT / FREQUENCY) / (4 * math.pi)
# The cells of the point and of the reference point in the grids of one row of the tests.
POINT, REFERENCE = (0, 0), (0, 1)


def product(first: date, second: date, release: str = "P05023", cycle: int = 30, track: str = "141") -> str:
    """Return the name of the product file of a GUNW pair of the pilot area, with its two dates."""
    one, two = first.strftime("%Y%m%d"), second.strftime("%Y%m%d")
    return (
        f"NISAR_L2_PR_GUNW_{cycle:03d}_{track}_D_067_{cycle + 1:03d}_4000_SH_{one}T234330_{one}T234405_"
        f"{two}T234330_{two}T234405_{release}_N_F_J_001"
    )


def pair_layers(first: date, second: date, **changes: Any) -> tuple[LayerDescription, LayerDescription]:
    """Describe the layer unwrappedPhase and the layer connectedComponents of one pair."""
    name = product(first, second, **{key: changes.pop(key) for key in ("release", "cycle", "track") if key in changes})
    days = (first.isoformat(), second.isoformat())
    phase = layer(name, *days, layer=PHASE, unit="rad", frequency=FREQUENCY, title=f"Phase {days[0]} {days[1]}")
    labels = layer(name, *days, layer=COMPONENTS, title=f"Components {days[0]} {days[1]}")
    phase = phase.model_copy(update={"id": f"phase-{first:%m%d}-{second:%m%d}", **changes})
    return phase, labels.model_copy(update={"id": f"labels-{first:%m%d}-{second:%m%d}"})


DAYS = [date(2026, 6, 23) + timedelta(days=12 * step) for step in range(4)]
CHAIN = [(DAYS[0], DAYS[1]), (DAYS[1], DAYS[2]), (DAYS[2], DAYS[3])]


def network(
    pairs: list[tuple[date, date]],
    phases: list[tuple[float, float]],
    labels: list[tuple[float, float]] | None = None,
) -> tuple[list[NDArray[np.float32]], list[LayerDescription]]:
    """Return the arrays and the descriptions of pairs: the phase at the point and the reference, then the labels."""
    arrays: list[NDArray[np.float32]] = []
    described: list[LayerDescription] = []
    for number, (dates, values) in enumerate(zip(pairs, phases, strict=True)):
        phase, components = pair_layers(*dates)
        arrays += [grid(list(values)), grid(list(labels[number] if labels else (1, 1)))]
        described += [phase, components]
    return arrays, described


def values_of(result: Any) -> list[tuple[Any, Any, int]]:
    return [(entry.dates, entry.value, entry.cells) for entry in result.entries]


def test_the_tool_is_listed_under_the_name_of_its_button() -> None:
    assert SERIES_TOOLS["displacement-series"] is displacement_series
    assert list(SERIES_TOOLS) == ["backscatter-series", "coherence-series", "displacement-series"]


def test_a_chain_of_pairs_gives_the_sum_of_the_referenced_phases_times_the_factor() -> None:
    arrays, layers = network(CHAIN, [(1.0, 0.25), (-2.0, 0.5), (0.5, 0.5)])
    result = displacement_series(arrays, layers, POINT, REFERENCE)
    phases = [0.0, 0.75, 0.75 - 2.5, 0.75 - 2.5 + 0.0]
    assert [entry.dates for entry in result.entries] == [(day,) for day in DAYS]
    assert [entry.cells for entry in result.entries] == [1, 1, 1, 1]
    assert [entry.value for entry in result.entries] == pytest.approx([FACTOR * phase for phase in phases], abs=1e-15)
    assert result.entries[0].value == 0.0
    assert math.copysign(1, result.entries[0].value or 0.0) == 1
    assert (result.quantity, result.unit, result.reduction, result.range, result.layer) == (
        "Displacement along the line of sight, relative to the reference point",
        "m",
        "mean",
        None,
        PHASE,
    )
    assert result.inputs == tuple(f"{product(*dates)}.h5" for dates in CHAIN)
    assert "Berardino et al., 2002" in result.method
    assert "--weight-func no and --mask-dset connectComponent" in result.method


def test_a_phase_that_grows_is_a_movement_away_from_the_radar() -> None:
    result = displacement_series(*network(CHAIN[:2], [(1.0, 0.0), (1.0, 0.0)]), POINT, REFERENCE)
    values = [entry.value for entry in result.entries if entry.value is not None]
    assert len(values) == 3
    assert values[0] == 0.0
    assert values[2] < values[1] < 0


def test_the_phase_of_the_reference_is_subtracted_in_32_bit_numbers() -> None:
    point, base = 0.1, 2.7
    result = displacement_series(*network(CHAIN[:2], [(point, base), (0.0, 1.0)]), POINT, REFERENCE)
    difference = float(np.float32(point) - np.float32(base))
    assert difference != float(np.float32(point)) - float(np.float32(base))
    assert result.entries[1].value == pytest.approx(FACTOR * difference, rel=1e-12, abs=0)


def test_a_network_with_more_pairs_than_dates_is_solved_by_least_squares() -> None:
    pairs = [*CHAIN, (DAYS[0], DAYS[2]), (DAYS[1], DAYS[3]), (DAYS[0], DAYS[3])]
    phases = [(1.0, 0.0), (2.0, 0.0), (-1.0, 0.0), (3.2, 0.0), (0.9, 0.0), (2.1, 0.0)]
    result = displacement_series(*network(pairs, phases), POINT, REFERENCE)
    # The phase of each date after the first, from the equations of the phases themselves (the solution is unique).
    order = {day: number for number, day in enumerate(DAYS)}
    design = np.zeros((len(pairs), len(DAYS) - 1))
    for row, (first, second) in enumerate(pairs):
        if order[first]:
            design[row, order[first] - 1] = -1
        design[row, order[second] - 1] = 1
    # The phases of the layers are 32-bit numbers.
    observed = np.array([np.float32(value) for value, _ in phases], np.float64)
    solution = np.linalg.lstsq(design, observed, rcond=None)[0]
    expected = [0.0, *(FACTOR * solution)]
    assert [entry.value for entry in result.entries] == pytest.approx(expected, abs=1e-12)
    # The residuals are not zero: the phases of the pairs do not close.
    assert np.linalg.norm(design @ solution - observed) > 0.1


def test_the_spans_between_the_dates_are_written_in_years_as_the_source_program_writes_them() -> None:
    assert DAYS_PER_YEAR == 365.25
    assert RCOND == 1e-5


def test_a_pair_where_the_point_has_no_reliable_phase_is_left_out_at_the_point() -> None:
    pairs = [*CHAIN, (DAYS[0], DAYS[2]), (DAYS[1], DAYS[3])]
    phases = [(1.0, 0.0), (2.0, 0.0), (-1.0, 0.0), (3.0, 0.0), (1.0, 0.0)]
    whole = displacement_series(*network(pairs, phases), POINT, REFERENCE)
    for wrong_phase, wrong_label in [(NAN, 1.0), (5.0, 0.0), (5.0, NAN), (5.0, 2.0), (float("inf"), 1.0)]:
        changed = [(wrong_phase, 0.0) if number == 1 else values for number, values in enumerate(phases)]
        labels = [(wrong_label, 1.0) if number == 1 else (1.0, 1.0) for number in range(len(pairs))]
        result = displacement_series(*network(pairs, changed, labels), POINT, REFERENCE)
        kept = sorted(dates for number, dates in enumerate(pairs) if number != 1)
        assert result.inputs == tuple(f"{product(*dates)}.h5" for dates in kept)
        # Without the pair of the second and the third date, the network is a chain through the longer pairs.
        assert [entry.value for entry in result.entries] == pytest.approx(
            [0.0, FACTOR * 1.0, FACTOR * 3.0, FACTOR * 2.0], abs=1e-12
        )
    assert len(whole.inputs) == len(pairs)


def test_the_point_and_the_reference_in_one_component_other_than_1_are_used() -> None:
    arrays, layers = network(CHAIN, [(1.0, 0.0), (1.0, 0.0), (1.0, 0.0)], [(3.0, 3.0), (2.0, 2.0), (1.0, 1.0)])
    assert len(displacement_series(arrays, layers, POINT, REFERENCE).inputs) == 3


def test_the_layers_may_come_in_any_order() -> None:
    arrays, layers = network(CHAIN, [(1.0, 0.25), (-2.0, 0.5), (0.5, 0.5)])
    order = [5, 0, 3, 2, 4, 1]
    shuffled = displacement_series([arrays[i] for i in order], [layers[i] for i in order], POINT, REFERENCE)
    assert shuffled == displacement_series(arrays, layers, POINT, REFERENCE)


def test_the_arrays_are_taken_one_after_another() -> None:
    arrays, layers = network(CHAIN, [(1.0, 0.25), (-2.0, 0.5), (0.5, 0.5)])
    taken: list[int] = []

    def one_by_one() -> Any:
        for number, array in enumerate(arrays):
            taken.append(number)
            yield array

    displacement_series(one_by_one(), layers, POINT, REFERENCE)
    assert taken == list(range(len(arrays)))


def refusal(arrays: Any, layers: Any, cell: Any = POINT, reference: Any = REFERENCE) -> str:
    with pytest.raises(LayerError) as refused:
        displacement_series(arrays, layers, cell, reference)
    return str(refused.value)


SOUND = network(CHAIN, [(1.0, 0.0), (1.0, 0.0), (1.0, 0.0)])


def test_the_series_needs_a_point_and_a_reference_point_in_two_cells() -> None:
    assert refusal(*SOUND, None, REFERENCE) == "The tool gives the series of a point, and no point was given."
    assert refusal(*SOUND, POINT, None) == (
        "The tool gives the series relative to a reference point, and no reference point was given."
    )
    assert refusal(*SOUND, POINT, POINT) == "The point and the reference point lie in the same cell of the layers."


def test_a_reference_without_a_reliable_phase_in_a_pair_is_refused() -> None:
    for values, labels in [((1.0, NAN), (1.0, 1.0)), ((1.0, 1.0), (1.0, 0.0)), ((1.0, 1.0), (1.0, NAN))]:
        arrays, layers = network(CHAIN, [(1.0, 0.0), values, (1.0, 0.0)], [(1.0, 1.0), labels, (1.0, 1.0)])
        assert refusal(arrays, layers) == (
            f'The reference point has no reliable phase in the layer "{layers[2].title}", so choose a reference '
            "point with one in every pair."
        )


def test_a_network_that_does_not_link_all_its_dates_is_refused() -> None:
    later = [(DAYS[2] + timedelta(days=12), DAYS[3] + timedelta(days=12))]
    arrays, layers = network([CHAIN[0], *later], [(1.0, 0.0), (1.0, 0.0)])
    assert refusal(arrays, layers) == (
        "The pairs do not link all their dates into one network, so the movement between the separate groups of "
        "dates is unknown."
    )


def test_a_network_that_the_pairs_left_at_the_point_do_not_link_is_refused() -> None:
    arrays, layers = network(CHAIN, [(1.0, 0.0), (NAN, 0.0), (1.0, 0.0)])
    assert refusal(arrays, layers) == (
        "At the point, the phase of 1 of the 3 pairs is not reliable relative to the reference point, and the "
        "other pairs do not link all the dates into one network."
    )
    arrays, layers = network(CHAIN, [(1.0, 0.0), (1.0, 0.0), (1.0, 0.0)], [(1.0, 1.0), (1.0, 1.0), (2.0, 1.0)])
    assert "the phase of 1 of the 3 pairs is not reliable" in refusal(arrays, layers)


def test_fewer_than_two_pairs_are_refused() -> None:
    arrays, layers = network(CHAIN[:1], [(1.0, 0.0)])
    assert refusal(arrays, layers) == "A series needs at least 2 pairs of dates, and it has 1."


def test_a_phase_without_its_connected_components_or_the_other_way_round_is_refused() -> None:
    arrays, layers = SOUND
    assert refusal(arrays[:5], layers[:5]) == (
        f'The layer of connected components of the product of the layer "{layers[4].title}" is missing.'
    )
    extra_arrays, extra = network([(DAYS[0], DAYS[3])], [(1.0, 0.0)])
    assert refusal([*arrays, extra_arrays[1]], [*layers, extra[1]]) == (
        f'The layer "{extra[1].title}" is not of the product of any layer unwrappedPhase of the series.'
    )
    assert refusal([*arrays, arrays[1]], [*layers, layers[1].model_copy(update={"id": "again"})]) == (
        f'The layers "{layers[1].title}" and "{layers[1].title}" are of the same product file.'
    )


def test_layers_of_two_channels_or_without_a_frequency_or_of_two_frequencies_are_refused() -> None:
    arrays, layers = SOUND
    other = layers[1].model_copy(update={"layer": "unwrappedInterferogram/VV/connectedComponents"})
    assert refusal(arrays, [layers[0], other, *layers[2:]]) == (
        f"The two layers are not of the same polarisation channel: the first is {PHASE} and the second is "
        "unwrappedInterferogram/VV/connectedComponents."
    )
    silent = layers[2].model_copy(update={"frequency": None})
    assert refusal(arrays, [*layers[:2], silent, *layers[3:]]) == (
        f'The layer "{silent.title}" does not record the centre frequency of its radar band; receive it again '
        "with Get layer."
    )
    wider = layers[2].model_copy(update={"frequency": 1257500000.0})
    assert refusal(arrays, [*layers[:2], wider, *layers[3:]]) == (
        f'The layers "{layers[0].title}" and "{wider.title}" have different centre frequencies of their radar '
        "band, so their phases cannot be combined."
    )


def test_a_pair_whose_reference_is_not_the_earlier_date_is_refused() -> None:
    arrays, layers = SOUND
    name = product(*CHAIN[0]).replace("20260623T", "20260801T", 2)
    later = [layer.model_copy(update={"inputs": (f"{name}.h5",)}) for layer in layers[:2]]
    assert refusal(arrays, [*later, *layers[2:]]) == (
        f'The name of the product file of the layer "{layers[0].title}" does not give a reference date that is '
        "earlier than the secondary date."
    )


def test_layers_that_the_tool_does_not_read_are_refused() -> None:
    arrays, layers = SOUND
    coherence = layers[0].model_copy(update={"layer": COHERENCE, "unit": "1", "frequency": None})
    assert refusal(arrays, [coherence, *layers[1:]]) == (
        f'The layer "{coherence.title}" is the layer {COHERENCE} of its product, and the tool reads the layers '
        "unwrappedPhase and connectedComponents."
    )
    gcov = layer(GCOV_21_OCT, "2026-10-21")
    assert "is not a layer received from one NISAR GUNW product" in refusal([grid([1, 1]), *arrays], [gcov, *layers])
    radians = layers[1].model_copy(update={"unit": "rad"})
    assert refusal(arrays, [layers[0], radians, *layers[2:]]) == (
        f'The layer "{radians.title}" has the unit rad, and the tool reads the unit 1.'
    )


def test_layers_of_two_tracks_or_two_releases_or_of_the_same_dates_are_refused() -> None:
    arrays, layers = SOUND
    other_arrays, others = network([CHAIN[2]], [(1.0, 0.0)])
    elsewhere = f"{product(*CHAIN[2], track='139')}.h5"
    track = [layer.model_copy(update={"inputs": (elsewhere,)}) for layer in others]
    assert refusal([*arrays[:4], *other_arrays], [*layers[:4], *track]) == (
        "The layers are not of the same instrument, track, direction and frame."
    )
    beta = f"{product(*CHAIN[2], release='X05010')}.h5"
    release = [layer.model_copy(update={"inputs": (beta,)}) for layer in others]
    assert "are not of the same major release of the processing software" in refusal(
        [*arrays[:4], *other_arrays], [*layers[:4], *release]
    )
    twin = f"{product(*CHAIN[0], cycle=40)}.h5"
    again = [layer.model_copy(update={"id": f"{layer.id}-again", "inputs": (twin,)}) for layer in layers[:2]]
    assert "have the same dates" in refusal([*arrays, *arrays[:2]], [*layers, *again])


def test_connected_components_that_are_not_whole_numbers_from_zero_are_refused() -> None:
    for wrong in (0.5, -1.0, float("inf")):
        arrays, layers = network(CHAIN, [(1.0, 0.0)] * 3, [(1.0, 1.0), (1.0, wrong), (1.0, 1.0)])
        assert refusal(arrays, layers) == (
            f'The layer "{layers[3].title}" holds values that are not whole numbers from 0, so it is not a layer '
            "of connected components."
        )


def test_layers_on_two_grids_are_refused_and_faults_of_the_caller_are_not_refusals() -> None:
    arrays, layers = SOUND
    assert refusal([*arrays[:5], grid([1, 1, 1])], layers) == "The input layers do not have the same grid."
    with pytest.raises(ValueError, match="not two-dimensional 32-bit floating point"):
        displacement_series([arrays[0].astype(np.float64), *arrays[1:]], layers, POINT, REFERENCE)
    with pytest.raises(ValueError, match="lies outside the grid"):
        displacement_series(arrays, layers, (0, 5), REFERENCE)
    with pytest.raises(ValueError):
        displacement_series(arrays[:5], layers, POINT, REFERENCE)


def test_the_other_series_tools_take_no_reference_point() -> None:
    gcov = [layer(GCOV_21_OCT, "2026-10-21"), layer(GCOV_2_NOV, "2026-11-02")]
    with pytest.raises(LayerError, match=r"^The tool takes no reference point\.$"):
        backscatter_series([grid([1.0])] * 2, gcov, (0, 0), (0, 0))
    with pytest.raises(LayerError, match=r"^The tool takes no reference point\.$"):
        coherence_series([grid([0.5])] * 2, [], None, (0, 0))


def test_result_fits_a_series_description_relative_to_its_reference_point() -> None:
    result = displacement_series(*SOUND, POINT, REFERENCE)
    point, place = Point(longitude=-71.0, latitude=42.8), Point(longitude=-70.9, latitude=42.7)
    description = SeriesDescription(
        id="series-1",
        title="Displacement at a point",
        kind="series",
        quantity=result.quantity,
        unit=result.unit,
        reduction=result.reduction,
        range=result.range,
        point=point,
        cell=Cell(row=0, column=0, longitude=-71.0, latitude=42.8),
        reference=Reference(point=place, cell=Cell(row=0, column=1, longitude=-70.9, latitude=42.7)),
        area=Area(west=-71.2, south=42.6, east=-70.75, north=42.95),
        entries=result.entries,
        inputs=result.inputs,
        layer=result.layer,
        program="Lynkeus 0.1.0",
        method=result.method,
    )
    assert len(description.entries) == len(description.inputs) + 1
    with pytest.raises(ValueError, match="has a pair for each date after the first"):
        SeriesDescription.model_validate({**description.model_dump(), "inputs": description.inputs[:1]})
    with pytest.raises(ValueError, match="relative to a reference point is a series at a point"):
        SeriesDescription.model_validate({**description.model_dump(), "point": None, "cell": None})
