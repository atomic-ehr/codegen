import base64
import json
from typing import TypeVar, Type, Dict, Any
import requests
from pydantic import BaseModel
from generated.hl7_fhir_r4_core import DomainResource, Bundle


T = TypeVar("T", bound=DomainResource)


class AuthCredentials(BaseModel):
    username: str
    password: str


class Auth(BaseModel):
    method: str
    credentials: AuthCredentials


def to_camel_case(snake_str: str) -> str:
    """Convert snake_case to camelCase"""
    components = snake_str.split("_")
    return components[0] + "".join(x.title() for x in components[1:])


class Client:
    def __init__(
        self,
        base_url: str,
        auth: Auth | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        if auth:
            if auth.method == "basic":
                self._set_basic_auth(
                    auth.credentials.username, auth.credentials.password
                )
            else:
                raise ValueError(f"Unsupported auth method: {auth.method}")

    def _set_basic_auth(self, username: str, password: str) -> None:
        """Set basic authentication headers"""
        credentials = f"{username}:{password}"
        encoded = base64.b64encode(credentials.encode()).decode()
        self.session.headers.update({"Authorization": f"Basic {encoded}"})

    def _get_resource_type(self, resource: DomainResource) -> str:
        """Get the resource type from the class name"""
        return resource.__class__.__name__

    def create(self, resource: T) -> T:
        """Create a new resource"""
        resource_type = self._get_resource_type(resource)
        url = f"{self.base_url}/{resource_type}"
        data = resource.model_dump(exclude_unset=True, exclude_none=True)
        response = self.session.post(url, json=data)
        response.raise_for_status()
        data = response.json()
        if not data.get("id"):
            raise ValueError("Response missing required 'id' field")
        return resource.__class__.model_validate(data)

    def read(self, resource_class: Type[T], resource_id: str) -> T:
        """Read a resource by ID"""
        resource_type = resource_class.__name__
        url = f"{self.base_url}/{resource_type}/{resource_id}"
        response = self.session.get(url)
        response.raise_for_status()
        data = response.json()
        if not data.get("id"):
            raise ValueError("Response missing required 'id' field")
        return resource_class.model_validate(data)

    def update(self, resource: T) -> T:
        """Update an existing resource"""
        resource_type = self._get_resource_type(resource)
        if not hasattr(resource, "id") or not resource.id:
            raise ValueError("Resource must have an ID for update")

        url = f"{self.base_url}/{resource_type}/{resource.id}"
        data = resource.model_dump(exclude_unset=True, exclude_none=True)
        response = self.session.put(url, json=data)
        response.raise_for_status()
        data = response.json()
        if not data.get("id"):
            raise ValueError("Response missing required 'id' field")
        return resource.__class__.model_validate(data)

    def delete(self, resource_type: str, resource_id: str) -> None:
        """Delete a resource"""
        url = f"{self.base_url}/{resource_type}/{resource_id}"
        response = self.session.delete(url)
        response.raise_for_status()

    def search(
        self, resource_class: Type[T], params: Dict[str, Any] | None = None
    ) -> Bundle:
        """Search for resources"""
        resource_type = resource_class.__name__
        url = f"{self.base_url}/{resource_type}"
        response = self.session.get(url, params=params)
        response.raise_for_status()
        return Bundle.model_validate(response.json())
