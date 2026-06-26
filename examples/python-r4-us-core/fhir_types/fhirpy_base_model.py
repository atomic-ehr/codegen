from typing import Any, Union, Optional, Iterator, Tuple, Dict
from pydantic import BaseModel, Field
from pydantic_core import PydanticUndefined
from typing import Protocol


class ResourceProtocol(Protocol):
    resourceType: Any
    id: Union[str, None]


class FhirpyBaseModel(BaseModel):
    """
    This class satisfies ResourceProtocol.
    Uses __pydantic_init_subclass__ to set resourceType as a class-level attribute
    after Pydantic finishes model construction, so that fhirpy can detect it
    via cls.resourceType for search/fetch operations.
    """
    id: Optional[str] = Field(None, alias="id")

    @classmethod
    def __pydantic_init_subclass__(cls, **kwargs: Any) -> None:
        super().__pydantic_init_subclass__(**kwargs)
        field = cls.model_fields.get("resource_type") or cls.model_fields.get("resourceType")
        # Only concrete resources carry a default resourceType. Abstract/family base types
        # (Resource, DomainResource) leave it unset, so we skip them to avoid registering a
        # class attribute that concrete subclasses would shadow.
        if field is not None and field.default is not None and field.default is not PydanticUndefined:
            type.__setattr__(cls, "resourceType", str(field.default))

    def __iter__(self) -> Iterator[Tuple[str, Any]]:  # type: ignore[override]
        data = self.model_dump(mode='json', by_alias=True, exclude_none=True)
        return iter(data.items())

    def serialize(self) -> Dict[str, Any]:
        """Serialize to dict (compatible with fhirpy's serialize method)"""
        return self.model_dump(mode='json', by_alias=True, exclude_none=True)
