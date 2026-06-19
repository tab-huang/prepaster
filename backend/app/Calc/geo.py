"""Geo helpers: turn (direction, distance) into lat/lon offsets, and back."""
from __future__ import annotations

import math

_METERS_PER_DEG_LAT = 111_320.0

COMPASS = [
    ("N", 0),
    ("NE", 45),
    ("E", 90),
    ("SE", 135),
    ("S", 180),
    ("SW", 225),
    ("W", 270),
    ("NW", 315),
]


def offset_point(lat: float, lon: float, bearing_deg: float, distance_m: float) -> tuple[float, float]:
    bearing = math.radians(bearing_deg)
    dlat = (distance_m * math.cos(bearing)) / _METERS_PER_DEG_LAT
    meters_per_deg_lon = _METERS_PER_DEG_LAT * math.cos(math.radians(lat))
    dlon = (distance_m * math.sin(bearing)) / meters_per_deg_lon
    return lat + dlat, lon + dlon


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres."""
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def bearing_to_compass(lat1: float, lon1: float, lat2: float, lon2: float) -> str:
    dlat = lat2 - lat1
    dlon = (lon2 - lon1) * math.cos(math.radians(lat1))
    angle = (math.degrees(math.atan2(dlon, dlat)) + 360) % 360
    names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    return names[round(angle / 45) % 8]


def point_in_polygon(lat: float, lon: float, ring: list[list[float]]) -> bool:
    """Ray-casting test. `ring` is a list of [lon, lat] pairs (GeoJSON order)."""
    inside = False
    n = len(ring)
    if n < 3:
        return False
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        intersects = ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside
