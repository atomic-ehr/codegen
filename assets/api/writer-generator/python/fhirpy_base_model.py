from typing import Any, Union, Optional, Iterator, Tuple, Dict
from pydantic import BaseModel, Field
from typing import Protocol


class ResourceProtocol(Protocol):
    resourceType: Any
    id: Union[str, None]


class FhirpyBaseModel(BaseModel):
    """
    This class satisfies ResourceProtocol
    """
    resource_type: str = Field(alias="resourceType")
    id: Optional[str] = Field(None, alias="id")

    @property
    def resourceType(self) -> str:
        return self.resource_type

    @resourceType.setter
    def resourceType(self, value: str) -> None:
        self.resource_type = value

    def __iter__(self) -> Iterator[Tuple[str, Any]]:  # type: ignore[override]
        data = self.model_dump(mode='json', by_alias=True, exclude_none=True)
        return iter(data.items())

    def serialize(self) -> Dict[str, Any]:
        """Serialize to dict (compatible with fhirpy's serialize method)"""
        return self.model_dump(mode='json', by_alias=True, exclude_none=True)
