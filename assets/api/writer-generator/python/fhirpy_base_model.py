from typing import Any, ClassVar, Type, Union, Optional, Iterator, Tuple, Dict
from pydantic import BaseModel, Field
from typing import Protocol


class ResourceProtocol(Protocol):
    resourceType: Any
    id: Union[str, None]


class ResourceTypeDescriptor:
    def __get__(self, instance: Optional[BaseModel], owner: Type[BaseModel]) -> str:
        field = owner.model_fields.get("resource_type")
        if field is None:
            raise ValueError("resource_type field not found")
        if field.default is None:
            raise ValueError("resource_type field default value is not set")
        return str(field.default)


class FhirpyBaseModel(BaseModel):
    """
    This class satisfies ResourceProtocol
    """
    id: Optional[str] = Field(None, alias="id")

    resourceType: ClassVar[ResourceTypeDescriptor] = ResourceTypeDescriptor()

    def __iter__(self) -> Iterator[Tuple[str, Any]]:  # type: ignore[override]
        data = self.model_dump(mode='json', by_alias=True, exclude_none=True)
        return iter(data.items())

    def serialize(self) -> Dict[str, Any]:
        """Serialize to dict (compatible with fhirpy's serialize method)"""
        return self.model_dump(mode='json', by_alias=True, exclude_none=True)
