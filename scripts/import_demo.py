"""Extract a client-safe demo snapshot from the supplied XLSX files.

Only the selected client's plan and attendance fields are retained. No operator
identity, subcontractor financial data, or other client records are exported.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
CLIENT_CODE = "H"
CLIENT_ID = "demo-medeu"
LOCAL_TZ = timezone(timedelta(hours=5))


def read_sheet(path: Path, sheet: int) -> list[tuple[int, dict[str, str]]]:
    with ZipFile(path) as archive:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            tree = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(node.itertext()) for node in tree]
        tree = ElementTree.fromstring(archive.read(f"xl/worksheets/sheet{sheet}.xml"))
        result = []
        for row in tree.findall(".//x:sheetData/x:row", NS):
            values = {}
            for cell in row:
                column = re.sub(r"\d", "", cell.attrib["r"])
                inline = cell.find("x:is", NS)
                value = "".join(inline.itertext()) if inline is not None else cell.findtext("x:v", "", NS)
                values[column] = shared[int(value)] if cell.get("t") == "s" else value
            result.append((int(row.attrib["r"]), values))
        return result


def timestamp(value: str) -> str | None:
    return datetime.strptime(value, "%d.%m.%Y %H:%M").replace(tzinfo=LOCAL_TZ).isoformat() if value else None


def main() -> None:
    package = next(ROOT.glob("IC HACK 2026*"))
    tables = next(package.glob("2_*"))
    portfolio = next(tables.glob("06_*.xlsx"))
    plan_file = next(tables.glob("04_*.xlsx"))
    fact_file = next(tables.glob("05_*.xlsx"))
    portfolio_row, client = next((n, r) for n, r in read_sheet(portfolio, 1) if r.get("A") == "K-008")
    object_row, obj = next((n, r) for n, r in read_sheet(plan_file, 2) if r.get("A") == CLIENT_CODE)
    facts = {r["A"]: (n, r) for n, r in read_sheet(fact_file, 1)[1:]}
    shifts = []
    for number, row in read_sheet(plan_file, 3)[1:]:
        if row.get("D") != CLIENT_CODE:
            continue
        fact_number, fact = facts.get(row["A"], (None, {}))
        shifts.append({
            "id": row["A"], "organization_id": CLIENT_ID, "object_id": "demo-nord",
            "work_date": datetime.strptime(row["B"], "%d.%m.%Y").date().isoformat(),
            "role": row["H"], "planned_start": timestamp(row["I"]), "planned_end": timestamp(row["J"]),
            "actual_start": timestamp(fact.get("C", "")), "actual_end": timestamp(fact.get("D", "")),
            "checklist_recorded": fact.get("E", "").lower() == "да",
            "plan_row": number, "fact_row": fact_number,
        })
    result = {
        "version": 1,
        "organization": {"id": CLIENT_ID, "name": client["B"], "is_demo": True},
        "objects": [{
            "id": "demo-nord", "organization_id": CLIENT_ID, "name": "ТРЦ «Норд»",
            "scope": "Места общего пользования и территория", "city": client["F"],
            "area_sqm": int(client["H"]), "contract_number": obj["C"], "contract_status": client["Q"],
        }],
        "sources": [
            {"file": portfolio.name, "sheet": "Портфель", "rows": str(portfolio_row), "purpose": "Организация, площадь, статус договора"},
            {"file": plan_file.name, "sheet": "Объекты", "rows": str(object_row), "purpose": "Объект и договор"},
            {"file": plan_file.name, "sheet": "График сентябрь 2026", "rows": "Клиент H", "purpose": "План работ"},
            {"file": fact_file.name, "sheet": "Отметки", "rows": "По ID смен клиента H", "purpose": "Фактические отметки"},
        ],
        "shifts": shifts,
    }
    destination = ROOT / "backend" / "data" / "demo_client.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(shifts)} shifts for one demo organization. No operator identities or financial fields exported.")


if __name__ == "__main__":
    main()
