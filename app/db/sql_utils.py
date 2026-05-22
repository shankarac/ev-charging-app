import re


_NAMED_PARAM_PATTERN = re.compile(r":([a-zA-Z_][a-zA-Z0-9_]*)")


def to_postgres_named_params(query: str) -> str:
    """
    Convert :named placeholders to psycopg's %(named)s format.
    """
    return _NAMED_PARAM_PATTERN.sub(r"%(\1)s", query)
