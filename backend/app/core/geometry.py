import math


def compute_area(geom):
    if geom is None or geom.is_empty:
        return 0.0
    return float(geom.area)


def _normalize_angle(angle):
    angle = angle % 180.0
    if angle < 0:
        angle += 180.0
    if angle > 90.0:
        angle = 180.0 - angle
    return float(abs(90.0 - angle))


def compute_ratio_and_orientation(geom):
    if geom is None or geom.is_empty:
        return 0.0, 0.0

    rectangle = geom.minimum_rotated_rectangle
    if rectangle.is_empty or rectangle.geom_type != "Polygon":
        return 0.0, 0.0

    coords = list(rectangle.exterior.coords)
    if len(coords) < 5:
        return 0.0, 0.0

    edges = []
    for index in range(4):
        x1, y1 = coords[index]
        x2, y2 = coords[index + 1]
        dx = x2 - x1
        dy = y2 - y1
        length = math.hypot(dx, dy)
        if length > 0:
            edges.append((length, dx, dy))

    if not edges:
        return 0.0, 0.0

    short_edge = min(length for length, _, _ in edges)
    long_length, long_dx, long_dy = max(edges, key=lambda item: item[0])
    ratio = float(long_length / short_edge) if short_edge else 0.0
    orientation = _normalize_angle(math.degrees(math.atan2(long_dy, long_dx)))

    return ratio, orientation
