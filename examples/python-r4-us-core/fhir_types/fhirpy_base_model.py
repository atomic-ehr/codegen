from typing import TYPE_CHECKING, Any, Union, Optional, Iterator, Tuple, Dict
from pydantic import BaseModel, Field
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

    if TYPE_CHECKING:
        # Set at runtime per-subclass by __pydantic_init_subclass__ below. Declared here
        # so static type-checkers see it: fhirpy's ResourceProtocol requires a settable
        # `resourceType`, and snake_case models expose the field as `resource_type`
        # (alias "resourceType"). A settable instance attr (not ClassVar) satisfies the
        # protocol's mutable member; the default keeps it optional for the pydantic mypy plugin.
        resourceType: str = ""

    id: Optional[str] = Field(None, alias="id")

    @classmethod
    def __pydantic_init_subclass__(cls, **kwargs: Any) -> None:
        super().__pydantic_init_subclass__(**kwargs)
        field = cls.model_fields.get("resource_type") or cls.model_fields.get("resourceType")
        if field is not None and field.default is not None:
            type.__setattr__(cls, "resourceType", str(field.default))

    def __iter__(self) -> Iterator[Tuple[str, Any]]:  # type: ignore[override]
        data = self.model_dump(mode='json', by_alias=True, exclude_none=True)
        return iter(data.items())

    def serialize(self) -> Dict[str, Any]:
        """Serialize to dict (compatible with fhirpy's serialize method)"""
        return self.model_dump(mode='json', by_alias=True, exclude_none=True)
