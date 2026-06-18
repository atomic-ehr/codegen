from __future__ import annotations

import re
import importlib
import importlib.util
from typing import Any


def _to_snake_case(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def _import_resource_class(package: str, resource_type: str) -> Any:
    module_name = f"{package}.{_to_snake_case(resource_type)}"
    if importlib.util.find_spec(module_name) is None:
        return None
    module = importlib.import_module(module_name)
    return getattr(module, resource_type, None)


def _preprocess_value(value: Any, package: str) -> Any:
    if isinstance(value, dict):
        resource_type = value.get("resourceType")
        if resource_type and isinstance(resource_type, str):
            cls = _import_resource_class(package, resource_type)
            if cls is not None:
                return cls.model_validate(value)
        return {k: _preprocess_value(v, package) for k, v in value.items()}
    if isinstance(value, list):
        return [_preprocess_value(item, package) for item in value]
    return value


def preprocess_resource_fields(data: dict[str, Any], package: str) -> dict[str, Any]:
    """Walk a FHIR resource dict and replace nested resource dicts with concrete model instances.

    Intended for use as a model_validator(mode='before') on generic resource containers
    such as Bundle or DomainResource. Processes field values (not the root dict itself) so
    the caller's own Pydantic validation still runs normally.
    """
    return {k: _preprocess_value(v, package) for k, v in data.items()}