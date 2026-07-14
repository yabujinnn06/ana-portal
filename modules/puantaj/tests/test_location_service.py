from __future__ import annotations

import unittest
from unittest.mock import MagicMock

from app.models import LocationStatus
from app.services.location import distance_m, haversine_distance_m, should_block_attendance
from app.settings import get_settings


class LocationServiceTests(unittest.TestCase):
    def test_distance_m_zero_for_same_point(self) -> None:
        value = distance_m(41.0, 29.0, 41.0, 29.0)
        self.assertAlmostEqual(value, 0.0, places=6)

    def test_distance_m_known_reference(self) -> None:
        # Approximate distance for 1 degree longitude on equator.
        value = distance_m(0.0, 0.0, 0.0, 1.0)
        self.assertAlmostEqual(value, 111_195, delta=300)

    def test_haversine_alias_matches_distance_m(self) -> None:
        v1 = distance_m(41.0082, 28.9784, 39.9334, 32.8597)
        v2 = haversine_distance_m(41.0082, 28.9784, 39.9334, 32.8597)
        self.assertAlmostEqual(v1, v2, places=9)


class LocationEnforcementTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_mode = get_settings().location_enforcement_mode
        self.original_blocks = get_settings().location_enforcement_block_statuses
        self.employee_location = MagicMock()

    def tearDown(self) -> None:
        get_settings().location_enforcement_mode = self.original_mode
        get_settings().location_enforcement_block_statuses = self.original_blocks

    def test_soft_mode_never_blocks(self) -> None:
        get_settings().location_enforcement_mode = "soft"
        get_settings().location_enforcement_block_statuses = "OUTSIDE_GEOFENCE,MOCK_GPS_SUSPECTED"
        self.assertFalse(should_block_attendance(LocationStatus.OUTSIDE_GEOFENCE, self.employee_location))
        self.assertFalse(should_block_attendance(LocationStatus.MOCK_GPS_SUSPECTED, self.employee_location))

    def test_off_mode_never_blocks(self) -> None:
        get_settings().location_enforcement_mode = "off"
        self.assertFalse(should_block_attendance(LocationStatus.OUTSIDE_GEOFENCE, self.employee_location))

    def test_strict_mode_blocks_listed_status(self) -> None:
        get_settings().location_enforcement_mode = "strict"
        get_settings().location_enforcement_block_statuses = "OUTSIDE_GEOFENCE,MOCK_GPS_SUSPECTED"
        self.assertTrue(should_block_attendance(LocationStatus.OUTSIDE_GEOFENCE, self.employee_location))
        self.assertTrue(should_block_attendance(LocationStatus.MOCK_GPS_SUSPECTED, self.employee_location))

    def test_strict_mode_passes_unlisted_status(self) -> None:
        get_settings().location_enforcement_mode = "strict"
        get_settings().location_enforcement_block_statuses = "OUTSIDE_GEOFENCE"
        self.assertFalse(should_block_attendance(LocationStatus.LOW_ACCURACY, self.employee_location))
        self.assertFalse(should_block_attendance(LocationStatus.VERIFIED_HOME, self.employee_location))

    def test_strict_mode_bypasses_when_no_employee_location(self) -> None:
        get_settings().location_enforcement_mode = "strict"
        get_settings().location_enforcement_block_statuses = "OUTSIDE_GEOFENCE,MOCK_GPS_SUSPECTED"
        self.assertFalse(should_block_attendance(LocationStatus.OUTSIDE_GEOFENCE, None))

    def test_empty_block_list_passes_strict(self) -> None:
        get_settings().location_enforcement_mode = "strict"
        get_settings().location_enforcement_block_statuses = ""
        self.assertFalse(should_block_attendance(LocationStatus.OUTSIDE_GEOFENCE, self.employee_location))


if __name__ == "__main__":
    unittest.main()

