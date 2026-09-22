"""Runtime semantics of the `fixed[x]` / `pattern[x]` constraint helpers.

Generated profile classes call these from `validate()`, with the element's
declared arity as the trailing argument. FHIR applies a constraint declared on a
repeating element to *every* repetition, and applies it only when the element is
actually present — an absent optional element is `validate_required`'s concern.
"""

from typing import Any

from fhir_types.profile_helpers import validate_fixed_value, validate_pattern_value

PROFILE = "ExampleProfile"

CATEGORY: dict[str, Any] = {
    "coding": [{"system": "http://example.test/category", "code": "example"}]
}
OTHER_CATEGORY: dict[str, Any] = {
    "coding": [{"system": "http://example.test/category", "code": "other"}]
}


def test_absent_field_passes_both_constraint_kinds() -> None:
    assert validate_fixed_value({"intent": "order"}, PROFILE, "doNotPerform", False) == []
    assert validate_pattern_value({"intent": "order"}, PROFILE, "category", CATEGORY) == []


def test_explicit_none_is_treated_as_absent() -> None:
    assert validate_fixed_value({"doNotPerform": None}, PROFILE, "doNotPerform", False) == []
    assert validate_pattern_value({"category": None}, PROFILE, "category", CATEGORY) == []


def test_present_single_value_is_matched() -> None:
    assert validate_fixed_value({"doNotPerform": False}, PROFILE, "doNotPerform", False) == []

    errors = validate_fixed_value({"doNotPerform": True}, PROFILE, "doNotPerform", False)
    assert errors == [f"{PROFILE}: field 'doNotPerform' does not match expected fixed value"]


def test_repeating_constraint_holds_for_every_repetition() -> None:
    assert validate_pattern_value({"category": [CATEGORY]}, PROFILE, "category", CATEGORY, True) == []
    assert (
        validate_pattern_value({"category": [CATEGORY, CATEGORY]}, PROFILE, "category", CATEGORY, True)
        == []
    )

    # One non-conformant repetition fails the whole element
    errors = validate_pattern_value(
        {"category": [CATEGORY, OTHER_CATEGORY]}, PROFILE, "category", CATEGORY, True
    )
    assert errors == [f"{PROFILE}: field 'category' does not match expected pattern"]


def test_repeating_constraint_rejects_an_empty_element() -> None:
    errors = validate_pattern_value({"category": []}, PROFILE, "category", CATEGORY, True)
    assert errors == [f"{PROFILE}: field 'category' does not match expected pattern"]


def test_repeating_constraint_applies_to_scalar_values() -> None:
    assert validate_fixed_value({"code": ["a", "a"]}, PROFILE, "code", "a", True) == []

    errors = validate_fixed_value({"code": ["a", "b"]}, PROFILE, "code", "a", True)
    assert errors == [f"{PROFILE}: field 'code' does not match expected fixed value"]


def test_single_valued_constraint_rejects_a_list() -> None:
    errors = validate_fixed_value({"code": ["a"]}, PROFILE, "code", "a")
    assert errors == [f"{PROFILE}: field 'code' does not match expected fixed value"]
