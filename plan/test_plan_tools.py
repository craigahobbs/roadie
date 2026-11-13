"""
Roadie planning tools unit tests - run with "make test"
"""

import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO

import numpy as np

import plan_tools


def plane_plan(units='feet', rise=0.1, size=11, spacing=10):
    """A plan on a plane rising to the north"""
    rows = [[100 + rise * (size - 1 - row) * spacing for _ in range(size)] for row in range(size)]
    return {
        'title': 'Plane',
        'units': units,
        'topography': {'spacing': spacing, 'elevations': rows},
        'start': {'x': 10, 'y': 10},
        'end': {'x': 90, 'y': 90},
        'options': []
    }


class RouteArgs:
    # pylint: disable=too-few-public-methods, too-many-instance-attributes
    def __init__(self, **kwargs):
        self.command = 'route'
        self.name = 'Test'
        self.description = None
        self.width = None
        self.surface = 'gravel'
        self.cut_slope = 1
        self.fill_slope = 1.5
        self.grade = None
        self.switchback_grade = 8
        self.turnouts = None
        self.bridge_fill = None
        self.existing_road = None
        self.via = None
        self.grade_weight = 1
        self.slope_weight = 1
        self.__dict__.update(kwargs)


class TestCrossSection(unittest.TestCase):

    def test_linear_areas(self):
        cut, fill = plan_tools.linear_areas(np.array([1.0, -1.0, -1.0]), np.array([3.0, -3.0, 3.0]), np.array([10.0, 10.0, 8.0]))
        np.testing.assert_allclose(cut, [20, 0, 9])
        np.testing.assert_allclose(fill, [0, 20, 1])

    def test_cross_section_matches_barescript(self):
        # Same as roadieModel.bare: plane cross slope 0.1, half width 5, at grade - cut 1.25 + 0.25 / 1.8
        section = plan_tools.cross_section(np.array(0.0), np.array(0.1), 5, 1, 1.5)
        self.assertAlmostEqual(float(section['cut']), 1.25 + 0.25 / 1.8)
        self.assertAlmostEqual(float(section['fill']), 1.25 + 0.25 / (2 * (2 / 3 - 0.1)))
        self.assertEqual(float(section['wall']), 0)

    def test_cross_section_wall(self):
        # A fill side slope steeper than the fill slope can't daylight - it's a wall
        section = plan_tools.cross_section(np.array(0.0), np.array(0.8), 5, 1, 1.5)
        self.assertAlmostEqual(float(section['wall']), 4)


class TestGeometry(unittest.TestCase):

    def test_points_in_polygon(self):
        square = np.array([[0, 0], [10, 0], [10, 10], [0, 10]])
        self.assertEqual(list(plan_tools.points_in_polygon(np.array([5, 15]), np.array([5, 5]), square)), [True, False])

    def test_segments_intersect(self):
        p1 = np.array([[0.0, 0.0], [0.0, 1.0]])
        p2 = np.array([[10.0, 0.0], [10.0, 1.0]])
        crosses, t = plan_tools.segments_intersect(p1, p2, np.array([5, -5]), np.array([5, 0.5]))
        self.assertEqual(list(crosses), [True, False])
        self.assertAlmostEqual(t[0], 0.5)

    def test_turn_radius(self):
        angles = np.linspace(0, np.pi / 2, 20)
        radius = plan_tools.turn_radius(100 * np.cos(angles), 100 * np.sin(angles))
        self.assertTrue(np.isinf(radius[0]) and np.isinf(radius[-1]))
        np.testing.assert_allclose(radius[1:-1], 100, rtol=1e-6)

    def test_smooth_curves(self):
        points = plan_tools.smooth_curves([(0, 0), (100, 0), (100, 100)], 5, 30)
        self.assertEqual(tuple(points[0]), (0, 0))
        self.assertEqual(tuple(points[-1]), (100, 100))
        self.assertGreaterEqual(plan_tools.turn_radius(points[:, 0], points[:, 1])[2:-2].min(), 30)

    def test_topo(self):
        topo = plan_tools.Topo(plane_plan())
        self.assertAlmostEqual(float(topo.elevation(50, 50)), 105)
        self.assertAlmostEqual(float(topo.elevation(-10, 120)), 110)
        dzdx, dzdy = topo.gradient(50, 50)
        self.assertAlmostEqual(float(dzdx), 0)
        self.assertAlmostEqual(float(dzdy), 0.1)

    def test_transect_crossings(self):
        labels = np.full((20, 20), -1, dtype=np.int32)
        labels[15, :] = 0
        labels[10, :] = 1
        labels[5, :] = 2
        self.assertEqual([crossing[0] for crossing in plan_tools.transect_crossings(labels, 10, 19, 10, 0)], [0, 1, 2])


class TestRouting(unittest.TestCase):

    def test_route_and_profile(self):
        # A 20% plane needs a switchback road to climb at the design grade
        plan = plane_plan(rise=0.2, size=61)
        plan['start'] = {'x': 100, 'y': 100}
        plan['end'] = {'x': 300, 'y': 500}
        with tempfile.TemporaryDirectory() as temp_dir:
            plan_path = os.path.join(temp_dir, 'plan.json')
            plan_tools.write_plan(plan_path, plan)
            with redirect_stdout(StringIO()):
                plan_tools.command_route(RouteArgs(plan=plan_path))
            with open(plan_path, 'r', encoding='utf-8') as plan_file:
                result = json.load(plan_file)
        option = result['options'][0]
        self.assertEqual(option['name'], 'Test')
        self.assertEqual(option['section'], {'width': 14, 'cutSlope': 1, 'fillSlope': 1.5, 'surface': 'gravel'})
        alignment = np.array([[p['x'], p['y'], p['z']] for p in option['alignment']])
        lengths = np.hypot(np.diff(alignment[:, 0]), np.diff(alignment[:, 1]))
        grades = np.abs(np.diff(alignment[:, 2])) / lengths
        self.assertLessEqual(grades.max(), 0.11 + 0.002)
        self.assertGreater(lengths.sum(), 400 * 0.2 / 0.11)
        self.assertEqual(tuple(alignment[0, :2]), (100, 100))
        self.assertEqual(tuple(alignment[-1, :2]), (300, 500))
        self.assertAlmostEqual(alignment[0, 2], 120, delta=1)
        self.assertAlmostEqual(alignment[-1, 2], 200, delta=1)
        self.assertTrue(all(structure['type'] in ('turnout', 'culvert', 'retainingWall') for structure in option['structures']))

    def test_design_profile_grade_limit(self):
        plan = plane_plan(rise=0.3, size=11)
        topo = plan_tools.Topo(plan)
        design = plan_tools.Design(plan, RouteArgs())
        x, y, stations = plan_tools.resample_polyline([(50, 0), (50, 100)], 5)
        profile, ground, _ = plan_tools.design_profile(topo, design, x, y, stations)
        self.assertLessEqual((np.abs(np.diff(profile)) / 5).max(), design.grade + 1e-9)
        self.assertAlmostEqual(profile[0], ground[0], delta=1)

    def test_design_profile_existing_road(self):
        # A road straight up a 30% plane - the existing road's second half follows the ground (no grade limit); the new
        # road's first half is held to the design grade and breaks grade to meet the existing road at the junction
        plan = plane_plan(rise=0.3, size=11)
        topo = plan_tools.Topo(plan)
        design = plan_tools.Design(plan, RouteArgs())
        x, y, stations = plan_tools.resample_polyline([(50, 0), (50, 100)], 5)
        existing = plan_tools.existing_mask(stations, [(50, 100)])
        self.assertEqual(int(existing.sum()), 11)
        profile, ground, _ = plan_tools.design_profile(topo, design, x, y, stations, existing)
        np.testing.assert_allclose(profile[existing], ground[existing])
        new_grades = np.abs(np.diff(profile[:10])) / 5
        self.assertLessEqual(new_grades.max(), design.grade + 1e-9)
        self.assertAlmostEqual(profile[0], ground[0], delta=1)

    def test_design_structures_existing_road(self):
        # A stream crossing, sag, walls, and turnouts are only placed on the new road
        plan = plane_plan(rise=0, size=41)
        plan['topography']['features'] = [
            {'type': 'stream', 'points': [{'x': 0, 'y': 102}, {'x': 400, 'y': 102}]},
            {'type': 'stream', 'points': [{'x': 0, 'y': 302}, {'x': 400, 'y': 302}]}
        ]
        topo = plan_tools.Topo(plan)
        design = plan_tools.Design(plan, RouteArgs())
        x, y, stations = plan_tools.resample_polyline([(200, 0), (200, 400)], 5)
        profile = topo.elevation(x, y)
        side_slope = np.zeros(len(x))
        structures = plan_tools.design_structures(topo, design, x, y, stations, profile, side_slope, [(200, 400)])
        self.assertEqual([(s['type'], s['station']) for s in structures if s['type'] == 'culvert'], [('culvert', 102)])
        self.assertTrue(all(s['station'] < 200 for s in structures if s['type'] == 'turnout'))
        self.assertIn({'type': 'existingRoad', 'station': 200, 'endStation': 400, 'name': 'Existing road'}, structures)

    def test_profile_keeps_existing_roads(self):
        # profile keeps the option's existing roads, and --existing-road sets them
        plan = plane_plan(rise=0.3, size=11)
        plan['options'] = [{
            'name': 'Test',
            'section': {'width': 14},
            'alignment': [{'x': 50, 'y': 0}, {'x': 50, 'y': 100}],
            'structures': [{'type': 'existingRoad', 'station': 50, 'endStation': 100}]
        }]
        with tempfile.TemporaryDirectory() as temp_dir:
            plan_path = os.path.join(temp_dir, 'plan.json')
            plan_tools.write_plan(plan_path, plan)
            with redirect_stdout(StringIO()):
                plan_tools.command_route(RouteArgs(plan=plan_path, command='profile'))
            with open(plan_path, 'r', encoding='utf-8') as plan_file:
                result = json.load(plan_file)
            existing_roads = [s for s in result['options'][0]['structures'] if s['type'] == 'existingRoad']
            self.assertEqual(existing_roads, [{'type': 'existingRoad', 'station': 50, 'endStation': 100, 'name': 'Existing road'}])
            alignment = result['options'][0]['alignment']
            self.assertAlmostEqual(alignment[-1]['z'], 130, delta=0.01)
            with redirect_stdout(StringIO()):
                plan_tools.command_route(RouteArgs(plan=plan_path, command='profile', existing_road=['20,40', '90,200', '300,400']))
            with open(plan_path, 'r', encoding='utf-8') as plan_file:
                result = json.load(plan_file)
            existing_roads = [s for s in result['options'][0]['structures'] if s['type'] == 'existingRoad']
            # Existing roads are clamped to the road's length
            self.assertEqual([(s['station'], s['endStation']) for s in existing_roads], [(20, 40), (90, 100)])


class TestPlot(unittest.TestCase):

    def test_plot_structures(self):
        # Every structure type plots, including an existing road section
        plan = plane_plan(rise=0.1, size=11)
        plan['options'] = [{
            'name': 'Test',
            'section': {'width': 14},
            'alignment': [{'x': 50, 'y': 0}, {'x': 50, 'y': 100}],
            'structures': [
                {'type': 'culvert', 'station': 10},
                {'type': 'retainingWall', 'station': 20, 'endStation': 30},
                {'type': 'bridge', 'station': 30, 'endStation': 40},
                {'type': 'turnout', 'station': 40, 'endStation': 45},
                {'type': 'existingRoad', 'station': 50, 'endStation': 100}
            ]
        }]
        with tempfile.TemporaryDirectory() as temp_dir:
            output = os.path.join(temp_dir, 'plot.png')
            with redirect_stdout(StringIO()):
                plan_tools.plot_plan(plan, output)
            self.assertGreater(os.path.getsize(output), 0)


class TestGrid(unittest.TestCase):

    def test_grid(self):
        # Synthetic contours of a plane rising to the north: elevation = 100 + (500 - pixel y) / 10
        contours = {
            'title': 'Grid Test',
            'units': 'meters',
            'scale': {'pixels': 100, 'distance': 50},
            'bounds': [0, 0, 400, 400],
            'spacing': 10,
            'contourInterval': 5,
            'contours': [{'elevation': 100 + (500 - py) / 10, 'points': [[0, py], [400, py]]} for py in range(0, 401, 50)],
            'start': {'point': [100, 300], 'label': 'A'},
            'end': {'point': [300, 100]},
            'features': [{'type': 'stream', 'name': 'Creek', 'points': [[200, 0], [200, 400]]}]
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            contours_path = os.path.join(temp_dir, 'contours.json')
            plan_path = os.path.join(temp_dir, 'plan.json')
            with open(contours_path, 'w', encoding='utf-8') as contours_file:
                json.dump(contours, contours_file)
            args = type('Args', (), {'contours': contours_path, 'plan': plan_path, 'preview': None})
            with redirect_stdout(StringIO()):
                plan_tools.command_grid(args)
            with open(plan_path, 'r', encoding='utf-8') as plan_file:
                plan = json.load(plan_file)
        self.assertEqual(plan['title'], 'Grid Test')
        self.assertEqual(plan['start'], {'x': 50, 'y': 50, 'label': 'A'})
        self.assertEqual(plan['end'], {'x': 150, 'y': 150})
        self.assertEqual(plan['topography']['features'][0]['points'][0], {'x': 100, 'y': 200})
        elevations = np.array(plan['topography']['elevations'])
        self.assertEqual(elevations.shape, (21, 21))
        # Row 0 is the north edge (pixel y 0, elevation 150); the south edge is elevation 110
        np.testing.assert_allclose(elevations[0], 150, atol=0.1)
        np.testing.assert_allclose(elevations[-1], 110, atol=0.1)


if __name__ == '__main__':
    unittest.main()
