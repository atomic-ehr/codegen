"""
Runtime helpers for generated FHIR profile classes.

This file is copied verbatim into every generated Python output and imported by
profile modules. It provides:

- **Slice helpers** – match, get, set, and default-fill array slices defined by
  a FHIR StructureDefinition.
- **Extension helpers** – read complex (nested) FHIR extensions into plain dicts.
- **Choice-type helpers** – wrap/unwrap polymorphic ``value[x]`` fields so
  profile classes can expose a flat API.
- **Validation helpers** – lightweight structural checks that profile classes
  call from their ``validate()`` method.
- **Misc utilities** – deep-match, deep-merge, path navigation.

The helpers operate on plain ``dict`` / ``list`` structures. Profile classes
own a Pydantic resource instance (``self._resource``); when a helper needs the
underlying data, the profile passes ``self._resource.model_dump(by_alias=True,
exclude_none=True)`` or accesses model fields directly. All ``validate_*``
functions return ``list[str]`` so a profile's ``validate()`` can concatenate
them into a single errors / warnings list.
"""

from __future__ import annotations

import copy
from typing import Any, Iterable, Mapping, MutableMapping, MutableSequence, Sequence, TypeVar

from typing_extensions import TypeGuard

T = TypeVar("T")

# ---------------------------------------------------------------------------
# General utilities
# ---------------------------------------------------------------------------


def is_record(value: object) -> TypeGuard[MutableMapping[str, Any]]:
    """True when ``value`` is a non-None mapping (dict-like, not a list)."""
    return isinstance(value, MutableMapping)


def ensure_path(root: MutableMapping[str, Any], path: Sequence[str]) -> MutableMapping[str, Any]:
    """Walk ``path`` from ``root``, creating intermediate dicts (or using the
    first element of an existing list) as needed. Returns the leaf mapping.

    Used by extension setters to reach a nested target inside a resource dict.
    """
    current: MutableMapping[str, Any] = root
    for segment in path:
        nxt = current.get(segment)
        if isinstance(nxt, list):
            if len(nxt) == 0:
                nxt.append({})
            current = nxt[0]
        else:
            if not isinstance(nxt, MutableMapping):
                nxt = {}
                current[segment] = nxt
            current = nxt
    return current


# ---------------------------------------------------------------------------
# Deep match / merge
# ---------------------------------------------------------------------------


def merge_match(target: MutableMapping[str, Any], match: Mapping[str, Any]) -> None:
    """Deep-merge ``match`` into ``target``, mutating ``target`` in place."""
    for key, match_value in match.items():
        if is_record(match_value):
            existing = target.get(key)
            if is_record(existing):
                merge_match(existing, match_value)
            else:
                target[key] = dict(match_value)
        else:
            target[key] = match_value


def apply_slice_match(input_obj: Mapping[str, Any], match: Mapping[str, Any]) -> dict[str, Any]:
    """Shallow-clone ``input_obj`` then deep-merge ``match`` on top, returning
    a complete slice element ready for insertion."""
    result: dict[str, Any] = dict(input_obj)
    merge_match(result, match)
    return result


def _get_key(obj: object, key: str) -> Any:
    """Retrieve ``key`` from a dict-like or Pydantic-model-like object."""
    if is_record(obj):
        return obj.get(key)
    return getattr(obj, key, None)


def _model_get(value: object, key: str) -> Any:
    """Get an attribute from a Pydantic model by Python name or field alias.

    Pydantic stores fields as snake_case attributes but slice match dicts use
    camelCase aliases (e.g. ``resourceType``). Try the direct attribute first;
    fall back to scanning ``model_fields`` for a matching alias.
    """
    direct = getattr(value, key, None)
    if direct is not None:
        return direct
    model_fields = getattr(type(value), "model_fields", None)
    if model_fields:
        for field_name, field_info in model_fields.items():
            if field_info.alias == key or field_info.serialization_alias == key:
                return getattr(value, field_name, None)
    return None


def matches_value(value: object, match: object) -> bool:
    """Recursively test whether ``value`` structurally contains everything in
    ``match``. Lists use "every match item has a corresponding value item"
    semantics; mappings are matched key-by-key; primitives use ``==``.

    Works with both plain dicts and Pydantic model instances.  When ``match``
    is a record and ``value`` is a list, returns ``True`` if any element in
    ``value`` satisfies the record match (handles nested array fields in FHIR
    discriminator patterns).

    Core discriminator check used to identify which array element belongs to a
    given FHIR slice.
    """
    if isinstance(match, list):
        if not isinstance(value, list):
            return False
        return all(any(matches_value(item, m_item) for item in value) for m_item in match)
    if is_record(match):
        if value is None:
            return False
        # Record match against a list: check any element matches
        if isinstance(value, list):
            return any(matches_value(item, match) for item in value)
        # Plain dict
        if is_record(value):
            for key, m_val in match.items():
                if not matches_value(value.get(key), m_val):
                    return False
            return True
        # Pydantic model (or any object with attributes) — use alias-aware lookup
        if hasattr(value, "__dict__"):
            for key, m_val in match.items():
                if not matches_value(_model_get(value, key), m_val):
                    return False
            return True
        return False
    return bool(value == match)


def is_extension(value: object, url: str | None = None) -> bool:
    """True when ``value`` looks like a raw FHIR Extension (has a ``url``).
    When ``url`` is given, also checks the URL matches.
    Works with both plain dicts and Pydantic model instances."""
    ext_url = _get_key(value, "url") if (is_record(value) or hasattr(value, "__dict__")) else None
    if ext_url is None:
        return False
    return url is None or bool(ext_url == url)


def get_extension_value(ext: object | None, field: str) -> Any:
    """Read a single typed value field from an Extension dict or Pydantic model,
    returning ``None`` when the extension itself is absent or the field is not set."""
    if ext is None:
        return None
    return _get_key(ext, field)


def push_extension(target: Any, ext: Any) -> None:
    """Push an extension onto ``target.extension`` (Pydantic model) or
    ``target['extension']`` (dict), creating the list if absent. ``ext`` may
    be either a dict-like mapping or a Pydantic model instance — mappings are
    shallow-copied, Pydantic models are stored as-is so attribute access and
    nested model instances are preserved."""
    lst = getattr(target, "extension", None) if hasattr(target, "__dict__") else target.get("extension")
    if not isinstance(lst, list):
        lst = []
    if hasattr(ext, "model_dump"):
        lst.append(ext)
    else:
        lst.append(dict(ext))
    if hasattr(target, "__dict__"):
        setattr(target, "extension", lst)
    else:
        target["extension"] = lst


# ---------------------------------------------------------------------------
# Extension helpers
# ---------------------------------------------------------------------------


def extract_complex_extension(
    extension: object | None,
    config: Sequence[Mapping[str, Any]],
) -> dict[str, Any] | None:
    """Read a complex (nested) FHIR extension into a plain key/value dict.

    Each entry in ``config`` describes one sub-extension by ``name`` (URL),
    ``valueField`` (e.g. ``"valueString"``), and ``isArray``.

    Works with both plain dicts and Pydantic model instances.
    """
    if extension is None:
        return None
    sub_exts = _get_key(extension, "extension")
    if not isinstance(sub_exts, list):
        return None
    result: dict[str, Any] = {}
    for entry in config:
        name = entry["name"]
        value_field = entry["valueField"]
        is_array = bool(entry["isArray"])
        matched = [e for e in sub_exts if _get_key(e, "url") == name]
        if is_array:
            result[name] = [_get_key(e, value_field) for e in matched]
        elif matched:
            result[name] = _get_key(matched[0], value_field)
    return result


# ---------------------------------------------------------------------------
# Slice helpers
# ---------------------------------------------------------------------------


def strip_match_keys(slice_obj: Mapping[str, Any], match_keys: Sequence[str]) -> dict[str, Any]:
    """Remove discriminator keys from a slice element, returning only the
    user-supplied portion."""
    result = dict(slice_obj)
    for key in match_keys:
        result.pop(key, None)
    return result


def wrap_slice_choice(input_obj: Mapping[str, Any], choice_variant: str) -> dict[str, Any]:
    """Wrap a flat input dict under a choice-type key. No-op when ``input_obj``
    is empty."""
    if len(input_obj) == 0:
        return dict(input_obj)
    return {choice_variant: dict(input_obj)}


def unwrap_slice_choice(
    slice_obj: Mapping[str, Any],
    match_keys: Sequence[str],
    choice_variant: str,
) -> dict[str, Any]:
    """Inverse of :func:`wrap_slice_choice`: strip discriminator keys, then
    hoist the value inside ``choice_variant`` up to the top level."""
    result = dict(slice_obj)
    for key in match_keys:
        result.pop(key, None)
    variant_value = result.pop(choice_variant, None)
    if is_record(variant_value):
        for k, v in variant_value.items():
            result[k] = v
    return result


def ensure_slice_defaults(items: MutableSequence[Any], *matches: Mapping[str, Any]) -> MutableSequence[Any]:
    """Ensure that every required slice has at least a stub element in the
    array. If no existing item satisfies a ``match``, a deep clone of the
    pattern is appended."""
    for match in matches:
        if not any(matches_value(item, match) for item in items):
            items.append(copy.deepcopy(dict(match)))
    return items


def build_resource(resource_cls: type[T], /, **fields: Any) -> T:
    """Instantiate a Pydantic resource class from kwargs, dropping ``None``
    values so optional fields don't appear in the dump.

    Centralises construction so generators don't need to import every model.
    """
    cleaned = {k: v for k, v in fields.items() if v is not None}
    return resource_cls(**cleaned)


def ensure_profile(resource: Any, canonical_url: str) -> None:
    """Add ``canonical_url`` to ``resource.meta.profile`` if not already
    present. Works on both Pydantic models and plain dicts; creates ``meta``
    and ``profile`` when missing."""
    if isinstance(resource, MutableMapping):
        meta = resource.get("meta")
        if not isinstance(meta, MutableMapping):
            meta = {}
            resource["meta"] = meta
        profiles = meta.get("profile")
        if not isinstance(profiles, list):
            profiles = []
            meta["profile"] = profiles
        if canonical_url not in profiles:
            profiles.append(canonical_url)
        return
    # Pydantic model path
    meta = getattr(resource, "meta", None)
    if meta is None:
        # Try to construct a Meta from the model's annotation
        meta_field = type(resource).model_fields.get("meta") if hasattr(type(resource), "model_fields") else None
        if meta_field is not None and meta_field.annotation is not None:
            try:
                import types as _types
                import typing as _typing
                ann = meta_field.annotation
                # Unwrap Optional[T] / Union[T, None] / T | None to get the actual class
                origin = getattr(ann, "__origin__", None)
                if origin is _typing.Union or isinstance(ann, _types.UnionType):
                    args = [a for a in ann.__args__ if a is not type(None)]
                    if args:
                        ann = args[0]
                meta = ann(profile=[canonical_url])
                resource.meta = meta
                return
            except Exception:
                pass
        # Fallback: shouldn't happen for FHIR resources
        return
    profiles = getattr(meta, "profile", None)
    if profiles is None:
        meta.profile = [canonical_url]
    elif canonical_url not in profiles:
        profiles.append(canonical_url)


def set_array_slice(lst: MutableSequence[Any], match: Mapping[str, Any], value: object) -> None:
    """Find or insert a slice element. If an element matching ``match``
    already exists it is replaced in place; otherwise ``value`` is appended."""
    for i, item in enumerate(lst):
        if matches_value(item, match):
            lst[i] = value
            return
    lst.append(value)


def get_array_slice(lst: Sequence[Any] | None, match: Mapping[str, Any]) -> Any:
    """Return the first element in ``lst`` that satisfies ``match``."""
    if lst is None:
        return None
    for item in lst:
        if matches_value(item, match):
            return item
    return None


def get_array_slices(lst: Sequence[Any] | None, match: Mapping[str, Any]) -> list[Any]:
    """Return all elements in ``lst`` that satisfy ``match``."""
    if lst is None:
        return []
    return [item for item in lst if matches_value(item, match)]


def set_array_slices(
    lst: MutableSequence[Any],
    match: Mapping[str, Any],
    values: Sequence[object],
) -> None:
    """Remove all elements matching ``match``, then append ``values``."""
    indices = [i for i, item in enumerate(lst) if matches_value(item, match)]
    for i in reversed(indices):
        del lst[i]
    lst.extend(values)


# ---------------------------------------------------------------------------
# Validation helpers
#
# Each function returns a list of human-readable error strings (empty = ok).
# Profile classes concatenate them all into a single list inside validate().
# ---------------------------------------------------------------------------


def _get_field(res: object, field: str) -> Any:
    if isinstance(res, Mapping):
        return res.get(field)
    return getattr(res, field, None)


def validate_required(res: object, profile_name: str, field: str) -> list[str]:
    """Checks that ``field`` is present (not ``None``)."""
    return (
        [f"{profile_name}: required field '{field}' is missing"]
        if _get_field(res, field) is None
        else []
    )


def validate_must_support(res: object, profile_name: str, field: str) -> list[str]:
    """Checks that a must-support field is populated (warning, not error)."""
    return (
        [f"{profile_name}: must-support field '{field}' is not populated"]
        if _get_field(res, field) is None
        else []
    )


def validate_excluded(res: object, profile_name: str, field: str) -> list[str]:
    """Checks that ``field`` is absent."""
    return (
        [f"{profile_name}: field '{field}' must not be present"]
        if _get_field(res, field) is not None
        else []
    )


def validate_fixed_value(res: object, profile_name: str, field: str, expected: object) -> list[str]:
    """Checks that ``field`` structurally contains the expected fixed value."""
    actual = _get_field(res, field)
    return (
        []
        if matches_value(actual, expected)
        else [f"{profile_name}: field '{field}' does not match expected fixed value"]
    )


def validate_pattern_value(res: object, profile_name: str, field: str, expected: object) -> list[str]:
    """Containment constraint for a field that may be absent: absence is
    ``validate_required``'s concern, so an absent field passes; a present one
    must structurally contain ``expected``."""
    actual = _get_field(res, field)
    if actual is None:
        return []
    return (
        []
        if matches_value(actual, expected)
        else [f"{profile_name}: field '{field}' does not match expected pattern"]
    )


def validate_slice_cardinality(
    res: object,
    profile_name: str,
    field: str,
    match: Mapping[str, Any],
    slice_name: str,
    min_count: int,
    max_count: int,
) -> list[str]:
    """Checks that the number of array elements matching ``match`` falls
    within ``[min_count, max_count]``. Pass ``max_count = 0`` for unbounded."""
    items = _get_field(res, field) or []
    if not isinstance(items, Iterable):
        items = []
    count = sum(1 for item in items if matches_value(item, match))
    errors: list[str] = []
    if count < min_count:
        errors.append(
            f"{profile_name}.{field}: slice '{slice_name}' requires at least {min_count} item(s), found {count}"
        )
    if max_count > 0 and count > max_count:
        errors.append(
            f"{profile_name}.{field}: slice '{slice_name}' allows at most {max_count} item(s), found {count}"
        )
    return errors


def validate_slice_fields(
    res: object,
    profile_name: str,
    field: str,
    match: Mapping[str, Any],
    slice_name: str,
    required_fields: Sequence[str],
    choice_groups: Sequence[Sequence[str]] = (),
) -> list[str]:
    """Validates required fields within matched slice elements. For each array
    item matching the discriminator, checks that the listed fields are present.

    ``choice_groups`` carries the required choice elements of the slice: each
    group lists the typed variants a single ``value[x]``-style element may take,
    and is satisfied by any one of them. E.g. ``[["valueCoding"]]`` for a slice
    whose ``value[x]`` is required and narrowed to Coding."""
    items = _get_field(res, field) or []
    if not isinstance(items, Iterable):
        items = []
    errors: list[str] = []
    for item in items:
        if not matches_value(item, match):
            continue
        for rf in required_fields:
            if _get_field(item, rf) is None:
                errors.append(f"{profile_name}.{field}[{slice_name}].{rf} is required")
        for group in choice_groups:
            if any(_get_field(item, variant) is not None for variant in group):
                continue
            errors.append(
                f"{profile_name}.{field}[{slice_name}].{group[0]} is required"
                if len(group) == 1
                else f"{profile_name}.{field}[{slice_name}]: at least one of {', '.join(group)} is required"
            )
    return errors


def validate_choice_required(res: object, profile_name: str, choices: Sequence[str]) -> list[str]:
    """Checks that at least one of the listed choice-type variants is present."""
    if any(_get_field(res, c) is not None for c in choices):
        return []
    return [f"{profile_name}: at least one of {', '.join(choices)} is required"]


def validate_choice_prohibited(res: object, profile_name: str, prohibited: Sequence[str]) -> list[str]:
    """Checks that none of the listed prohibited choice-type variants is present.
    E.g. a profile narrowing ``value[x]`` to ``value_quantity`` prohibits every
    other variant."""
    return [
        f"{profile_name}: field '{c}' must not be present"
        for c in prohibited
        if _get_field(res, c) is not None
    ]


def validate_enum(res: object, profile_name: str, field: str, allowed: Sequence[str]) -> list[str]:
    """Checks that the value of ``field`` has a code within ``allowed``.
    Handles plain strings, Coding, and CodeableConcept."""
    value = _get_field(res, field)
    if value is None:
        return []
    if isinstance(value, str):
        return (
            []
            if value in allowed
            else [f"{profile_name}: field '{field}' value '{value}' is not in allowed values"]
        )
    # Coding
    code = _get_field(value, "code")
    system = _get_field(value, "system")
    if isinstance(code, str) and system is not None:
        return (
            []
            if code in allowed
            else [f"{profile_name}: field '{field}' code '{code}' is not in allowed values"]
        )
    # CodeableConcept
    coding = _get_field(value, "coding")
    if isinstance(coding, list):
        codes = [_get_field(c, "code") for c in coding]
        codes = [c for c in codes if isinstance(c, str)]
        if any(c in allowed for c in codes):
            return []
        return [f"{profile_name}: field '{field}' has no coding with an allowed code"]
    return []


def validate_reference(res: object, profile_name: str, field: str, allowed: Sequence[str]) -> list[str]:
    """Checks that a Reference field points to one of the ``allowed`` resource
    types. Extracts the type from the ``reference`` string (the part before
    the first ``/``)."""
    value = _get_field(res, field)
    if value is None:
        return []
    ref = _get_field(value, "reference")
    if not isinstance(ref, str):
        return []
    slash = ref.find("/")
    if slash == -1:
        return []
    ref_type = ref[:slash]
    if ref_type in allowed:
        return []
    return [
        f"{profile_name}: field '{field}' references '{ref_type}' but only {', '.join(allowed)} are allowed"
    ]
