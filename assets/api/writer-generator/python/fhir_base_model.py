from typing import Any, Union, Optional, Iterator, Tuple
from pydantic import BaseModel, Field
from typing import Protocol

class ResourceProtocol(Protocol):
    resourceType: Any
    id: Union[str, None]


class FhirBaseModel(BaseModel):
    """
    This class satisfies ResourceProtocol
    """
    resource_type: str = Field(alias="resourceType")
    id: Optional[str] = Field(None, alias="id")

    @property
    def resourceType(self) -> str:
        return self.resource_type

    @resourceType.setter
    def resourceType(self, value: str):
        self.resource_type = value

    def __iter__(self) -> Iterator[Tuple[str, Any]]:
        data = self.model_dump(mode='json', by_alias=True, exclude_none=True)
        return iter(data.items())

    def serialize(self) -> dict:
        """Serialize to dict (compatible with fhirpy's serialize method)"""
        return self.model_dump(mode='json', by_alias=True, exclude_none=True)