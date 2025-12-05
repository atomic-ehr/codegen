import re
import importlib
import importlib.util
from typing import Any, Annotated, List

from pydantic import BeforeValidator, BaseModel, ValidationError
from pydantic_core import ValidationError as PydanticCoreValidationError


def to_snake_case(name: str) -> str:
    s = re.sub(r"(?<!^)(?=[A-Z])", "_", name)
    return s.lower()


def module_exists(name: str) -> bool:
    """Checks if a module exists without importing it"""
    return importlib.util.find_spec(name) is not None


def import_and_create_module(module_name: str, class_name: str) -> Any:
    """
    Dynamically import a module and create an instance of a specified class.

    Args:
        module_name: String name of the module (e.g., 'aidbox.hl7_fhir_r4_core.patient')
        class_name: String name of the class (e.g., 'Patient')

    Returns:
        Instance of the specified class
    """
    try:
        module = importlib.import_module(module_name)
        class_obj = getattr(module, class_name)
        return class_obj

    except (ImportError, AttributeError) as e:
        raise ImportError(f"Could not import {class_name} from {module_name}: {e}")


def import_and_create_module_if_exists(package: str, class_name: str) -> Any:
    """
    Dynamically import a module and create an instance of a specified class if the module exists.

    Args:
        package: String name of the package (e.g., 'aidbox.hl7_fhir_r4_core')
        class_name: String name of the class (e.g., 'Patient')

    Returns:
        Instance of the specified class or None if the module does not exist
    """
    module_name = package + "." + to_snake_case(class_name)
    if module_exists(module_name):
        return import_and_create_module(module_name, class_name)
    else:
        return None


def validate_and_downcast(
    resource_data: dict[str, Any], package_list: List[str], family: List[str]
) -> Any:
    """
    Validates and downcasts ResourceFamily to the appropriate FHIR resource class

    Args:
        resource_data: Input value (dict)
        package_list: List of package names to search for resource classes (e.g., ['aidbox.hl7_fhir_r4_core', 'aidbox.hl7_fhir_r4_extras'])
        family: List of valid resource types (e.g., 'Group' or 'Patient')

    Returns:
        Instance of the appropriate FHIR resource class
    """

    # Extract and validate resource type
    resource_type = resource_data.get("resourceType")
    if not resource_type:
        raise ValueError("Missing 'resourceType' field in resource")

    if resource_type not in family:
        raise ValueError(f"Invalid resourceType '{resource_type}'. ")

    # Dynamically import and instantiate the appropriate class
    target_class = None
    for package in package_list:
        target_class = import_and_create_module_if_exists(package, resource_type)
        if target_class is not None:
            break
    if target_class is None:
        raise ImportError(
            f"Could not find class for resourceType '{resource_type}' in packages {package_list}"
        )

    return target_class.model_validate(resource_data)
