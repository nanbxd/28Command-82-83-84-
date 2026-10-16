"""Export the public checklist example, without operators or financial data."""

import json
from pathlib import Path

from import_demo import read_sheet

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "02_Чек-листы_стандарт_и_пример.xlsx"


def main() -> None:
    source = next(ROOT.glob(f"IC HACK 2026*/2_*/{SOURCE}"))
    sheet = dict(read_sheet(source, 2))
    rows = [
        {
            "zone": values["A"],
            "kind": values["B"],
            "workers": int(values["C"]),
            "minutes": int(values["D"]),
            "tasks": [line.strip().removeprefix("- ") for line in values["E"].splitlines() if line.strip()],
            "frequency": values["F"],
            "personMinutes": int(values["G"]),
            "sourceRow": row_number,
        }
        for row_number, values in sheet.items() if 5 <= row_number <= 14
    ]
    payload = {
        "source": SOURCE,
        "sheet": "Пример — Вента, ТРЦ Норд",
        "title": sheet[1]["A"],
        "conditions": sheet[2]["A"],
        "basicPersonMinutes": 190,
        "availablePersonMinutes": 360,
        "rows": rows,
    }
    assert sum(row["personMinutes"] for row in rows if row["kind"] == "базовая") == 190
    target = ROOT / "frontend/src/features/admin/checklist.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(rows)} checklist rows; 190 basic person-minutes, 960 general person-minutes.")


if __name__ == "__main__":
    main()
