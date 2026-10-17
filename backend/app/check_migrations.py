"""Validate the migration graph during image build, without connecting to a DB."""
from pathlib import Path
import warnings

from alembic.script import ScriptDirectory


def check_migrations(directory: Path) -> str:
    with warnings.catch_warnings():
        warnings.filterwarnings("error", message=r"Revision .* is present more than once")
        scripts = ScriptDirectory(str(directory))
        heads = scripts.get_heads()
        if len(heads) != 1:
            raise RuntimeError(f"Expected one migration head, found {heads}")
        list(scripts.walk_revisions())
    return heads[0]


if __name__ == "__main__":
    head = check_migrations(Path(__file__).resolve().parents[1] / "migrations")
    print(f"Migration graph OK: {head}")
