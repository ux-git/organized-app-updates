#!/usr/bin/env python3
"""Builds seed/streets.json, street name -> territory numbers, for a private
build: OpenStreetMap streets (fetched once, cached in seed/osm-streets.json)
intersected with the territory borders in seed/boundaries.json.

    python scripts/streets.py [osm.json]

Needs shapely. The OSM file is Overpass JSON with `out geom`.
"""
import json
import math
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from shapely.geometry import LineString, Polygon
from shapely.validation import make_valid

SEED = Path(__file__).resolve().parent.parent / "seed"
CACHE = SEED / "osm-streets.json"
# streets without houses along them
SKIP = {
    "motorway", "motorway_link", "trunk_link", "primary_link",
    "secondary_link", "tertiary_link", "platform", "steps", "proposed",
    "construction", "raceway", "bus_stop", "elevator", "corridor",
}
# a street runs along a border: both sides count; one merely touching it doesn't
MARGIN_M = 15
MIN_LENGTH_M = 25


def fetch(bbox):
    south, west, north, east = bbox
    query = (
        "[out:json][timeout:180];"
        f'way["highway"]["name"]({south},{west},{north},{east});out geom;'
    )
    data = urllib.parse.urlencode({"data": query}).encode()
    with urllib.request.urlopen(
        "https://overpass-api.de/api/interpreter", data, timeout=240
    ) as response:
        CACHE.write_bytes(response.read())


def main():
    borders = json.loads((SEED / "boundaries.json").read_text())
    points = [p for b in borders.values() for p in b["boundary"]]
    lat0 = sum(p[1] for p in points) / len(points)
    kx = 111320 * math.cos(math.radians(lat0))
    ky = 110540

    def meters(lng, lat):
        return (lng * kx, lat * ky)

    osm = Path(sys.argv[1]) if len(sys.argv) > 1 else CACHE
    if not osm.exists():
        lngs = [p[0] for p in points]
        lats = [p[1] for p in points]
        fetch((min(lats), min(lngs), max(lats), max(lngs)))
        osm = CACHE

    areas = {}
    for number, border in borders.items():
        ring = [meters(lng, lat) for lng, lat in border["boundary"]]
        if len(ring) >= 3:
            areas[number] = make_valid(Polygon(ring)).buffer(MARGIN_M)

    streets = {}
    for way in json.loads(osm.read_text())["elements"]:
        tags = way.get("tags", {})
        name = tags.get("name", "").strip()
        geometry = way.get("geometry") or []
        if not name or tags.get("highway") in SKIP or len(geometry) < 2:
            continue
        line = LineString([meters(p["lon"], p["lat"]) for p in geometry])
        need = min(MIN_LENGTH_M, line.length * 0.5)
        for number, area in areas.items():
            if area.intersects(line) and area.intersection(line).length >= need:
                streets.setdefault(name, set()).add(number)

    def order(number):
        prefix = number.rstrip("0123456789")
        return (prefix, int(number[len(prefix):] or 0))

    result = {
        name: sorted(numbers, key=order)
        for name, numbers in sorted(streets.items(), key=lambda s: s[0].lower())
    }
    (SEED / "streets.json").write_text(
        json.dumps(result, ensure_ascii=False, separators=(",", ":"))
    )
    print(f"{len(result)} streets in {len(areas)} territories")


if __name__ == "__main__":
    main()
