"""Minimal reader for the supplied spreadsheet source files."""
import re
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile

NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def read_sheet(path: Path, sheet: int) -> list[tuple[int, dict[str, str]]]:
    with ZipFile(path) as archive:
        shared = []
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
