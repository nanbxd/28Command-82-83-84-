from pathlib import Path

import pytest

from app.check_migrations import check_migrations


def test_repository_has_one_unambiguous_migration_head():
    assert check_migrations(Path(__file__).resolve().parents[1] / 'migrations') == 'c28a14f03005'


@pytest.mark.parametrize('duplicate', [True, False])
def test_duplicate_ids_and_multiple_heads_fail_build(tmp_path, duplicate):
    versions = tmp_path / 'versions'
    versions.mkdir()
    (versions / 'first.py').write_text("revision = 'first'\ndown_revision = None\n")
    (versions / 'second.py').write_text(f"revision = {'first' if duplicate else 'second'!r}\ndown_revision = None\n")
    with pytest.raises((UserWarning, RuntimeError)):
        check_migrations(tmp_path)
