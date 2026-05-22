from typing import Any, Mapping, Protocol, Sequence


QueryParams = Mapping[str, Any] | Sequence[Any] | None


class DatabaseAdapter(Protocol):
    def initialize(self) -> None:
        ...

    def fetch_one(self, query: str, params: QueryParams = None) -> Any:
        ...

    def fetch_all(self, query: str, params: QueryParams = None) -> list[Any]:
        ...

    def execute(self, query: str, params: QueryParams = None) -> Any:
        ...
