#!/usr/bin/env python3
"""
Roadie road planning tools - used by the "make plan" Claude Code session to digitize a topographic
map image into a road plan model and to engineer road plan options.

Subcommands:
  info     Print an image's size and dominant colors (to choose contour line colors)
  crop     Crop and enlarge an image region (to read labels and contour details)
  trace    Extract contour line pixels of a color into numbered components, with a preview image
  grid     Build the road plan model's topography from digitized contours (contours JSON)
  plot     Plot a road plan model - contours, features, and options - optionally over the map image
  route    Engineer a road option - least-cost horizontal alignment search and vertical profile design
  profile  Re-design the vertical profile (and structures) of an existing option's alignment

Run "python3 plan_tools.py <subcommand> -h" for each subcommand's arguments.
"""

import argparse
import heapq
import json
import math
import os
import sys

import numpy as np


# The default cost rates, in nominal US dollars per metric unit - keep in sync with ../viewer/lib/model.js
DEFAULT_RATES = {
    'clearing': 2,
    'excavation': 20,
    'rockExcavation': 100,
    'embankment': 6.5,
    'borrow': 26,
    'waste': 10,
    'overhaul': 2.5,
    'freeHaul': 150,
    'shrink': 0.87,
    'swell': 1.1,
    'native': 1.5,
    'gravel': 19,
    'asphalt': 40,
    'concrete': 90,
    'drainage': 45,
    'culvert': 875,
    'culvertEnds': 6000,
    'retainingWall': 650,
    'bridge': 2700,
    'existingRoad': 13,
    'erosionControl': 0.75,
    'mobilization': 0.1
}

METERS_PER_FOOT = 0.3048


def main(argv=None):
    """The planning tools command-line entry point"""
    parser = argparse.ArgumentParser(prog='plan_tools.py', description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    subparsers = parser.add_subparsers(dest='command', required=True)

    parser_info = subparsers.add_parser('info', help="print an image's size and dominant colors")
    parser_info.add_argument('image', help='the image file')
    parser_info.add_argument('-n', '--count', type=int, default=16, help='the number of dominant colors (default is 16)')

    parser_crop = subparsers.add_parser('crop', help='crop and enlarge an image region')
    parser_crop.add_argument('image', help='the image file')
    parser_crop.add_argument('output', help='the output PNG file')
    parser_crop.add_argument('left', type=int, help='the crop left pixel')
    parser_crop.add_argument('top', type=int, help='the crop top pixel')
    parser_crop.add_argument('width', type=int, help='the crop width, in pixels')
    parser_crop.add_argument('height', type=int, help='the crop height, in pixels')
    parser_crop.add_argument('-s', '--scale', type=float, default=3, help='the enlargement scale (default is 3)')
    parser_crop.add_argument('-g', '--grid', type=int, default=0, help='draw a labeled pixel grid every N source pixels')

    parser_trace = subparsers.add_parser('trace', help='extract contour line components of a color')
    parser_trace.add_argument('image', help='the image file')
    parser_trace.add_argument('output', help='the output traced components JSON file')
    parser_trace.add_argument('preview', help='the output preview PNG file (numbered components)')
    parser_trace.add_argument('-c', '--color', action='append', metavar='R,G,B', help='a contour line color (may be repeated)')
    parser_trace.add_argument('-t', '--tolerance', type=float, default=60, help='the color distance tolerance (default is 60)')
    parser_trace.add_argument('-u', '--hue', type=float, action='append',
                              help='a contour line hue, in degrees (may be repeated) - matches anti-aliased line pixels')
    parser_trace.add_argument('--hue-tolerance', type=float, default=15, help='the hue tolerance, in degrees (default is 15)')
    parser_trace.add_argument('--min-saturation', type=float, default=0.12,
                              help='the minimum saturation of hue matches (default is 0.12)')
    parser_trace.add_argument('-m', '--min-pixels', type=int, default=25, help='the minimum component size (default is 25)')
    parser_trace.add_argument('-b', '--bounds', metavar='LEFT,TOP,RIGHT,BOTTOM', help='limit tracing to a pixel rectangle')

    parser_transect = subparsers.add_parser('transect', help='list the traced components crossed by a line, in order')
    parser_transect.add_argument('traced', help='the traced components JSON file')
    parser_transect.add_argument('line', metavar='X1,Y1,X2,Y2', help='the transect line, in image pixels')

    parser_grid = subparsers.add_parser('grid', help="build the plan's topography from digitized contours")
    parser_grid.add_argument('contours', help='the contours JSON file')
    parser_grid.add_argument('plan', help='the road plan model JSON file to create or update')
    parser_grid.add_argument('-p', '--preview', help='write a preview PNG of the grid contours over the map image')

    parser_plot = subparsers.add_parser('plot', help='plot a road plan model')
    parser_plot.add_argument('plan', help='the road plan model JSON file')
    parser_plot.add_argument('output', help='the output PNG file')
    parser_plot.add_argument('-c', '--contours', help='the contours JSON file (to plot over the map image)')

    for name, help_text in (('route', 'engineer a road option'), ('profile', "re-design an option's vertical profile")):
        parser_route = subparsers.add_parser(name, help=help_text)
        parser_route.add_argument('plan', help='the road plan model JSON file to update')
        parser_route.add_argument('-n', '--name', required=True, help='the option name (an existing option is replaced)')
        parser_route.add_argument('-d', '--description', action='append', help='an option description line (may be repeated)')
        parser_route.add_argument('-w', '--width', type=float, help='the road width (default is 14 feet / 4.3 meters)')
        parser_route.add_argument('-s', '--surface', choices=('native', 'gravel', 'asphalt', 'concrete'), default='gravel',
                                  help='the road surface (default is gravel)')
        parser_route.add_argument('--cut-slope', type=float, default=1, help='the cut slope ratio H:V (default is 1)')
        parser_route.add_argument('--fill-slope', type=float, default=1.5, help='the fill slope ratio H:V (default is 1.5)')
        parser_route.add_argument('-g', '--grade', type=float,
                                  help='the design grade, in percent (default is 1 less than the maximum grade)')
        parser_route.add_argument('--switchback-grade', type=float, default=8,
                                  help='the maximum grade on tight curves, in percent (default is 8)')
        parser_route.add_argument('--turnouts', type=float,
                                  help='the turnout spacing, 0 for none (default is 400 feet / 120 meters for roads under 16 feet wide)')
        parser_route.add_argument('--bridge-fill', type=float,
                                  help='replace stream crossing fills deeper than this with a bridge, up to 150 feet / 45 meters long '
                                       '(default is no bridges)')
        parser_route.add_argument('--existing-road', action='append', metavar='STATION,END',
                                  help='a station range where the road follows an existing road - its grade follows the ground, with no '
                                       'earthwork or structures (may be repeated; profile keeps the option\'s existing roads by default)')
        if name == 'route':
            parser_route.add_argument('-v', '--via', action='append', metavar='X,Y', help='a via point (may be repeated)')
            parser_route.add_argument('--grade-weight', type=float, default=1,
                                      help='the excess grade penalty weight (default is 1)')
            parser_route.add_argument('--slope-weight', type=float, default=1,
                                      help='the side slope earthwork weight (default is 1)')

    args = parser.parse_args(args=argv)
    commands = {'info': command_info, 'crop': command_crop, 'trace': command_trace, 'transect': command_transect, 'grid': command_grid,
                'plot': command_plot}
    commands.get(args.command, command_route)(args)


#
# Image subcommands
#

def load_image(path):
    """Load an image file as an RGB image"""
    from PIL import Image # pylint: disable=import-outside-toplevel
    return Image.open(path).convert('RGB')


def command_info(args):
    """The "info" subcommand - print an image's size and dominant colors"""
    image = load_image(args.image)
    pixels = np.asarray(image).reshape(-1, 3)
    quantized = (pixels // 16).astype(np.int32)
    keys = quantized[:, 0] * 256 + quantized[:, 1] * 16 + quantized[:, 2]
    counts = np.bincount(keys, minlength=4096)
    print(f'{args.image}: {image.width} x {image.height} pixels')
    print('Dominant colors (R,G,B - hue, saturation - percent of pixels):')
    for key in np.argsort(counts)[::-1][:args.count]:
        if counts[key] == 0:
            break
        mask = keys == key
        mean = pixels[mask].mean(axis=0)
        hue, saturation = image_hue_saturation(mean.reshape(1, 1, 3))
        print(f'  {int(mean[0])},{int(mean[1])},{int(mean[2])} - hue {hue[0, 0]:.0f}, saturation {saturation[0, 0]:.2f} - '
              f'{100 * counts[key] / len(keys):.2f}%')


def command_crop(args):
    """The "crop" subcommand - crop and enlarge an image region, with an optional labeled pixel grid"""
    from PIL import Image, ImageDraw # pylint: disable=import-outside-toplevel
    image = load_image(args.image)
    crop = image.crop((args.left, args.top, args.left + args.width, args.top + args.height))
    crop = crop.resize((int(args.width * args.scale), int(args.height * args.scale)), Image.Resampling.LANCZOS)
    if args.grid > 0:
        draw = ImageDraw.Draw(crop)
        start_x = (args.left // args.grid + 1) * args.grid
        for px in range(start_x, args.left + args.width, args.grid):
            sx = (px - args.left) * args.scale
            draw.line([(sx, 0), (sx, crop.height)], fill=(255, 0, 255), width=1)
            draw.text((sx + 2, 2), str(px), fill=(255, 0, 255))
        start_y = (args.top // args.grid + 1) * args.grid
        for py in range(start_y, args.top + args.height, args.grid):
            sy = (py - args.top) * args.scale
            draw.line([(0, sy), (crop.width, sy)], fill=(255, 0, 255), width=1)
            draw.text((2, sy + 2), str(py), fill=(255, 0, 255))
    crop.save(args.output)
    print(f'Wrote {args.output} ({crop.width} x {crop.height})')


def parse_ints(text, count):
    """Parse a comma-separated list of a number of integers"""
    values = [int(float(value)) for value in text.split(',')]
    if len(values) != count:
        raise SystemExit(f'error: expected {count} comma-separated values, got "{text}"')
    return values


def command_trace(args):
    """The "trace" subcommand - extract contour line pixels of a color into numbered components, with a preview image"""
    from PIL import Image, ImageDraw, ImageFont # pylint: disable=import-outside-toplevel
    from scipy import ndimage # pylint: disable=import-outside-toplevel

    if not args.color and not args.hue:
        raise SystemExit('error: specify at least one --color or --hue')
    image = load_image(args.image)
    pixels = np.asarray(image).astype(np.float64)
    mask = np.zeros(pixels.shape[:2], dtype=bool)
    for color_text in args.color or []:
        color = np.array(parse_ints(color_text, 3), dtype=np.float64)
        mask |= np.sqrt(((pixels - color) ** 2).sum(axis=2)) <= args.tolerance
    if args.hue:
        hue, saturation = image_hue_saturation(pixels)
        for target in args.hue:
            difference = np.abs((hue - target + 180) % 360 - 180)
            mask |= (difference <= args.hue_tolerance) & (saturation >= args.min_saturation)
    if args.bounds:
        left, top, right, bottom = parse_ints(args.bounds, 4)
        bounds_mask = np.zeros_like(mask)
        bounds_mask[top:bottom, left:right] = True
        mask &= bounds_mask

    # Label the connected components (8-connected), largest first
    labels, count = ndimage.label(mask, structure=np.ones((3, 3), dtype=int))
    sizes = ndimage.sum(mask, labels, index=np.arange(1, count + 1))
    components = []
    component_labels = np.full(labels.shape, -1, dtype=np.int32)
    preview_pixels = (np.asarray(image) * 0.3 + 255 * 0.7).astype(np.uint8)
    rng = np.random.default_rng(1)
    for index in np.argsort(sizes)[::-1]:
        if sizes[index] < args.min_pixels:
            break
        rows, cols = np.nonzero(labels == index + 1)
        component_id = len(components)
        component_labels[rows, cols] = component_id
        step = max(1, len(rows) // 400)
        order = np.lexsort((rows, cols))
        points = [[int(cols[ix]), int(rows[ix])] for ix in order[::step]]
        components.append({'id': component_id, 'pixels': int(sizes[index]), 'points': points})
        preview_pixels[rows, cols] = rng.integers(0, 180, size=3)

    # Preview image (2x) with each component's number at its ends and middle
    preview = Image.fromarray(preview_pixels)
    preview = preview.resize((preview.width * 2, preview.height * 2), Image.Resampling.NEAREST)
    draw = ImageDraw.Draw(preview)
    try:
        font = ImageFont.load_default(size=16)
    except TypeError: # pragma: no cover
        font = ImageFont.load_default()
    for component in components:
        points = component['points']
        text = str(component['id'])
        for ix_label in sorted({0, len(points) // 2, len(points) - 1}):
            px, py = points[ix_label]
            position = (px * 2 + 4, py * 2 - 18)
            draw.rectangle(draw.textbbox(position, text, font=font), fill=(255, 255, 255))
            draw.text(position, text, fill=(220, 0, 0), font=font)
    preview.save(args.preview)
    np.save(traced_labels_path(args.output), component_labels)
    with open(args.output, 'w', encoding='utf-8') as output_file:
        json.dump({'image': args.image, 'components': components}, output_file)
    print(f'Traced {len(components)} components ({count - len(components)} small components ignored)')
    print(f'Wrote {args.output}, {traced_labels_path(args.output)}, and {args.preview} (2x scale)')


def image_hue_saturation(pixels):
    """Compute the hue (degrees) and HSV saturation of an RGB pixel array"""
    red, green, blue = pixels[..., 0], pixels[..., 1], pixels[..., 2]
    maximum = pixels.max(axis=2)
    minimum = pixels.min(axis=2)
    delta = maximum - minimum
    with np.errstate(divide='ignore', invalid='ignore'):
        hue = np.where(maximum == red, ((green - blue) / delta) % 6,
                       np.where(maximum == green, (blue - red) / delta + 2, (red - green) / delta + 4)) * 60
        saturation = np.where(maximum > 0, delta / maximum, 0)
    return np.nan_to_num(hue), np.nan_to_num(saturation)


def traced_labels_path(traced_path):
    """Get the path of a traced contours file's component label image"""
    return os.path.splitext(traced_path)[0] + '.labels.npy'


def transect_crossings(labels, x1, y1, x2, y2):
    """Get the ordered (component id, x, y) crossings of a transect line over a component label image"""
    count = int(max(abs(x2 - x1), abs(y2 - y1)) * 2) + 1
    crossings = []
    for ix in range(count + 1):
        px = x1 + (x2 - x1) * ix / count
        py = y1 + (y2 - y1) * ix / count
        row = int(round(py))
        col = int(round(px))
        window = labels[max(0, row - 1):row + 2, max(0, col - 1):col + 2]
        found = window[window >= 0]
        component = int(np.bincount(found).argmax()) if len(found) else None
        if component is not None and (not crossings or crossings[-1][0] != component):
            crossings.append((component, round(px), round(py)))
    return crossings


def command_transect(args):
    """The "transect" subcommand - list the traced components a line crosses, in order"""
    labels = np.load(traced_labels_path(args.traced))
    x1, y1, x2, y2 = parse_ints(args.line, 4)
    crossings = transect_crossings(labels, x1, y1, x2, y2)
    print(f'Transect ({x1}, {y1}) to ({x2}, {y2}) crosses {len(crossings)} components, in order:')
    for component, px, py in crossings:
        print(f'  component {component} at ({px}, {py})')


#
# Topography grid
#

def contour_points(contours_model, contours_dir):
    """Get the digitized contour points (pixel x, pixel y, elevation)"""
    traced = None
    traced_path = contours_model.get('traced')
    if traced_path:
        traced_path = os.path.join(contours_dir, traced_path)
        traced = {component['id']: component for component in load_json(traced_path)['components']}

    # Assign traced component elevations - transects first, then explicit component contours
    excluded = set(contours_model.get('exclude', []))
    component_elevations = {}
    conflicts = []
    if contours_model.get('transects'):
        labels = np.load(traced_labels_path(traced_path))
        for transect in contours_model['transects']:
            skip = set(transect.get('skip', [])) | excluded
            x1, y1, x2, y2 = transect['line']
            elevation = float(transect['start'])
            step = float(transect['step'])
            crossed = [component for component, _, _ in transect_crossings(labels, x1, y1, x2, y2) if component not in skip]
            if 'end' in transect and crossed and elevation + step * (len(crossed) - 1) != float(transect['end']):
                conflicts.append(f'transect {transect["line"]} crosses {len(crossed)} components ({", ".join(map(str, crossed))}) - '
                                 f'expected {round(abs((float(transect["end"]) - elevation) / step)) + 1} to reach {transect["end"]:g} '
                                 '(skip non-contour components or fix the line)')
                continue
            for component in crossed:
                if component in component_elevations and component_elevations[component] != elevation:
                    conflicts.append(f'component {component}: {component_elevations[component]:g} and {elevation:g} '
                                     f'(transect {transect["line"]})')
                component_elevations[component] = elevation
                elevation += step
    points = []
    for contour in contours_model.get('contours', []):
        elevation = float(contour['elevation'])
        polyline = contour.get('points')
        if polyline is None:
            component_elevations[contour['component']] = elevation
        else:
            # Densify the polyline to at most 4 pixels between points
            for ix_point, (px, py) in enumerate(polyline):
                if ix_point > 0:
                    prev_x, prev_y = polyline[ix_point - 1]
                    count = max(1, int(math.hypot(px - prev_x, py - prev_y) / 4))
                    for ix_step in range(1, count):
                        t = ix_step / count
                        points.append((prev_x + (px - prev_x) * t, prev_y + (py - prev_y) * t, elevation))
                points.append((px, py, elevation))
    for component, elevation in component_elevations.items():
        if component not in excluded:
            points.extend((px, py, elevation) for px, py in traced[component]['points'])
    for spot in contours_model.get('spots', []):
        points.append((spot['point'][0], spot['point'][1], float(spot['elevation'])))
    if conflicts:
        print('WARNING: contour labeling problems (fix these and re-run):')
        for conflict in conflicts:
            print(f'  {conflict}')
    if traced is not None:
        unassigned = sorted(set(traced) - set(component_elevations) - excluded)
        if unassigned:
            print(f'Unassigned traced components (ignored): {", ".join(str(component) for component in unassigned)}')
    return np.array(points, dtype=np.float64)


def georeference(contours_model, points):
    """Get the georeference: (left, top, right, bottom) pixel bounds and pixels per unit"""
    scale = contours_model['scale']
    pixels_per_unit = float(scale['pixels']) / float(scale['distance'])
    bounds = contours_model.get('bounds')
    if bounds is None:
        bounds = [points[:, 0].min(), points[:, 1].min(), points[:, 0].max(), points[:, 1].max()]
    return [float(value) for value in bounds], pixels_per_unit


def pixel_to_plan(georef, px, py):
    """Convert image pixel coordinates to plan coordinates"""
    (left, _, _, bottom), pixels_per_unit = georef
    return (px - left) / pixels_per_unit, (bottom - py) / pixels_per_unit


def plan_point(georef, px, py):
    """Get a pixel's plan point model, rounded to hundredths"""
    x, y = pixel_to_plan(georef, px, py)
    return {'x': round(x, 2), 'y': round(y, 2)}


def command_grid(args):
    """The "grid" subcommand - build the road plan model's topography from digitized contours"""
    from scipy.interpolate import RBFInterpolator # pylint: disable=import-outside-toplevel

    contours_dir = os.path.dirname(os.path.abspath(args.contours))
    contours_model = load_json(args.contours)
    points = contour_points(contours_model, contours_dir)
    if len(points) < 10:
        raise SystemExit('error: too few contour points')
    georef = georeference(contours_model, points)
    (left, top, right, bottom), pixels_per_unit = georef
    width = (right - left) / pixels_per_unit
    height = (bottom - top) / pixels_per_unit

    # Grid spacing (default is about 120 cells on the long side, rounded)
    spacing = contours_model.get('spacing')
    if spacing is None:
        spacing = nice_number(max(width, height) / 120)
    n_cols = int(width / spacing) + 1
    n_rows = int(height / spacing) + 1

    # Interpolate the contour points to the grid (thin plate spline using nearby points)
    plan_x, plan_y = pixel_to_plan(georef, points[:, 0], points[:, 1])
    # Thin the points to one per half grid cell per elevation, so each neighborhood spans several contours
    cell = spacing * 0.5
    keys = np.column_stack([np.round(plan_x / cell), np.round(plan_y / cell), points[:, 2]])
    _, unique_index = np.unique(keys, axis=0, return_index=True)
    data_xy = np.column_stack([plan_x, plan_y])[unique_index]
    data_z = points[unique_index, 2]
    interpolator = RBFInterpolator(data_xy, data_z, neighbors=min(80, len(data_z)), kernel='thin_plate_spline', smoothing=0.5)
    grid_x, grid_y = np.meshgrid(np.arange(n_cols) * spacing, (n_rows - 1 - np.arange(n_rows)) * spacing)
    grid_z = interpolator(np.column_stack([grid_x.ravel(), grid_y.ravel()])).reshape(n_rows, n_cols)
    interval = float(contours_model.get('contourInterval') or 0)
    grid_z = np.clip(grid_z, data_z.min() - interval, data_z.max() + interval)

    # Create or update the road plan model
    plan = load_json(args.plan) if os.path.isfile(args.plan) else {}
    plan['title'] = contours_model.get('title', plan.get('title', 'Road Plan'))
    if 'description' in contours_model:
        plan['description'] = contours_model['description']
    if 'image' in contours_model:
        plan['image'] = os.path.relpath(os.path.join(contours_dir, contours_model['image']),
                                        os.path.dirname(os.path.abspath(args.plan)))
    plan['units'] = contours_model['units']
    topography = {'spacing': spacing, 'elevations': [[round(float(z), 2) for z in row] for row in grid_z]}
    if interval > 0:
        topography['contourInterval'] = interval
    features = []
    for feature in contours_model.get('features', []):
        feature_model = {'type': feature['type'], 'points': [plan_point(georef, px, py) for px, py in feature['points']]}
        if 'name' in feature:
            feature_model['name'] = feature['name']
        features.append(feature_model)
    if features:
        topography['features'] = features
    plan['topography'] = topography
    for endpoint in ('start', 'end'):
        endpoint_model = contours_model[endpoint]
        plan[endpoint] = plan_point(georef, *endpoint_model['point'])
        if 'label' in endpoint_model:
            plan[endpoint]['label'] = endpoint_model['label']
    plan.setdefault('options', [])
    plan = order_plan(plan)
    write_plan(args.plan, plan)

    # Report
    print(f'Grid: {n_cols} x {n_rows} at {spacing:g} {plan["units"]} spacing ({width:.0f} x {height:.0f} {plan["units"]}), '
          f'from {len(data_z)} contour points')
    print(f'Elevations: {grid_z.min():.1f} to {grid_z.max():.1f}')
    for endpoint in ('start', 'end'):
        point = plan[endpoint]
        print(f'{endpoint}: ({point["x"]}, {point["y"]}) ground {Topo(plan).elevation(point["x"], point["y"]):.1f}')
    print(f'Wrote {args.plan}')
    if args.preview:
        plot_plan(plan, args.preview, contours_model, contours_dir)


def nice_number(value):
    """Round a positive number up to a nice number - 1, 2, 2.5, 5, or 10 times a power of ten"""
    power = 10 ** math.floor(math.log10(value))
    for multiple in (1, 2, 2.5, 5):
        if multiple * power >= value:
            return multiple * power
    return 10 * power


def order_plan(plan):
    """Order a road plan model's members - the model's members in schema order, then any others"""
    keys = ('title', 'description', 'image', 'units', 'topography', 'start', 'end', 'criteria', 'costRates', 'options')
    return {key: plan[key] for key in keys if key in plan} | {key: value for key, value in plan.items() if key not in keys}


def load_json(path):
    """Load a JSON file"""
    with open(path, 'r', encoding='utf-8') as file:
        return json.load(file)


def write_plan(path, plan):
    """Write a road plan model file"""
    # Write the plan with one elevation row per line for readability
    rows = plan['topography']['elevations']
    plan_copy = dict(plan)
    plan_copy['topography'] = dict(plan['topography'])
    plan_copy['topography']['elevations'] = '__ELEVATIONS__'
    text = json.dumps(plan_copy, indent=2)
    rows_text = '[\n' + ',\n'.join('      ' + json.dumps(row) for row in rows) + '\n    ]'
    with open(path, 'w', encoding='utf-8') as plan_file:
        plan_file.write(text.replace('"__ELEVATIONS__"', rows_text) + '\n')


#
# Topography model
#

class Topo:
    """The road plan topography - bilinear elevation and gradient"""

    def __init__(self, plan):
        topography = plan['topography']
        self.z = np.array(topography['elevations'], dtype=np.float64)
        self.spacing = float(topography['spacing'])
        self.n_rows, self.n_cols = self.z.shape
        self.width = (self.n_cols - 1) * self.spacing
        self.height = (self.n_rows - 1) * self.spacing
        self.features = topography.get('features', [])

    def inside(self, x, y):
        """Determine if points are within the topography grid"""
        return (x >= 0) & (y >= 0) & (x <= self.width) & (y <= self.height)

    def elevation(self, x, y):
        """Get the ground elevation at points - bilinear interpolation, clamped to the grid"""
        x = np.clip(np.asarray(x, dtype=np.float64), 0, self.width)
        y = np.clip(np.asarray(y, dtype=np.float64), 0, self.height)
        f_col = x / self.spacing
        f_row = (self.n_rows - 1) - y / self.spacing
        col = np.clip(np.floor(f_col).astype(int), 0, self.n_cols - 2)
        row = np.clip(np.floor(f_row).astype(int), 0, self.n_rows - 2)
        tx = np.clip(f_col - col, 0, 1)
        ty = np.clip(f_row - row, 0, 1)
        z_top = self.z[row, col] * (1 - tx) + self.z[row, col + 1] * tx
        z_bottom = self.z[row + 1, col] * (1 - tx) + self.z[row + 1, col + 1] * tx
        return z_top * (1 - ty) + z_bottom * ty

    def gradient(self, x, y):
        """Get the ground elevation gradient (dz/dx, dz/dy) at points"""
        h = self.spacing * 0.5
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        x1 = np.maximum(0, x - h)
        x2 = np.minimum(self.width, x + h)
        y1 = np.maximum(0, y - h)
        y2 = np.minimum(self.height, y + h)
        dzdx = (self.elevation(x2, y) - self.elevation(x1, y)) / np.maximum(x2 - x1, 1e-9)
        dzdy = (self.elevation(x, y2) - self.elevation(x, y1)) / np.maximum(y2 - y1, 1e-9)
        return dzdx, dzdy

    def polygons(self, feature_type):
        """Get the point arrays of the topography's polygon features of a type"""
        return [xy_array(feature['points']) for feature in self.features if feature['type'] == feature_type]

    def streams(self):
        """Get the topography's stream features as (name, point array) tuples"""
        return [(feature.get('name', 'stream'), xy_array(feature['points']))
                for feature in self.features if feature['type'] == 'stream']


def xy_array(points):
    """Get an array of point models' [x, y] coordinates"""
    return np.array([[p['x'], p['y']] for p in points])


def points_in_polygon(x, y, polygon):
    """Determine if points are inside a polygon, by the even-odd rule"""
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    inside = np.zeros(np.broadcast(x, y).shape, dtype=bool)
    j = len(polygon) - 1
    for i, (xi, yi) in enumerate(polygon):
        xj, yj = polygon[j]
        crosses = (yi > y) != (yj > y)
        with np.errstate(divide='ignore', invalid='ignore'):
            x_cross = (xj - xi) * (y - yi) / (yj - yi) + xi
        inside ^= crosses & (x < x_cross)
        j = i
    return inside


def segments_intersect(p1, p2, q1, q2):
    """Vectorized segment intersection test of segments p1-p2 (arrays of points) with segment q1-q2"""
    d_x = p2[..., 0] - p1[..., 0]
    d_y = p2[..., 1] - p1[..., 1]
    e_x = q2[0] - q1[0]
    e_y = q2[1] - q1[1]
    denom = d_x * e_y - d_y * e_x
    with np.errstate(divide='ignore', invalid='ignore'):
        t = ((q1[0] - p1[..., 0]) * e_y - (q1[1] - p1[..., 1]) * e_x) / denom
        u = ((q1[0] - p1[..., 0]) * d_y - (q1[1] - p1[..., 1]) * d_x) / denom
    return (denom != 0) & (t >= 0) & (t <= 1) & (u >= 0) & (u <= 1), t


#
# Cross sections (vectorized mirror of ../viewer/lib/model.js's crossSection)
#

def linear_areas(v1, v2, length):
    """Compute the positive (cut) and negative (fill) areas under a value that varies linearly from v1 to v2 over a length"""
    both_pos = (v1 >= 0) & (v2 >= 0)
    both_neg = (v1 <= 0) & (v2 <= 0)
    positive = np.maximum(np.maximum(v1, v2), 0)
    negative = np.maximum(-np.minimum(v1, v2), 0)
    with np.errstate(divide='ignore', invalid='ignore'):
        length_pos = length * positive / (positive + negative)
    cut = np.where(both_pos, (v1 + v2) * 0.5 * length, np.where(both_neg, 0, 0.5 * positive * length_pos))
    fill = np.where(both_neg, -(v1 + v2) * 0.5 * length, np.where(both_pos, 0, 0.5 * negative * (length - length_pos)))
    return np.nan_to_num(cut), np.nan_to_num(fill)


def side_section(depth, rise, cut_slope, fill_slope):
    """Returns (cut area, fill area, offset, wall height) - a slope that does not daylight is a wall"""
    cut_approach = 1 / cut_slope - rise
    fill_approach = rise + 1 / fill_slope
    is_cut = depth > 0
    is_fill = depth < 0
    cut_day = is_cut & (cut_approach > 1e-6)
    fill_day = is_fill & (fill_approach > 1e-6)
    with np.errstate(divide='ignore', invalid='ignore'):
        cut_offset = np.where(cut_day, depth / cut_approach, 0)
        fill_offset = np.where(fill_day, -depth / fill_approach, 0)
    cut = np.where(cut_day, depth * cut_offset * 0.5, 0)
    fill = np.where(fill_day, -depth * fill_offset * 0.5, 0)
    wall = np.where((is_cut & ~cut_day) | (is_fill & ~fill_day), np.abs(depth), 0)
    return cut, fill, cut_offset + fill_offset, wall


def cross_section(depth, slope, half_width, cut_slope, fill_slope):
    """Returns the cross section dict of arrays: cut, fill, slope width, wall area per unit length, and sides"""
    depth_left = depth + slope * half_width
    depth_right = depth - slope * half_width
    road_cut, road_fill = linear_areas(depth_right, depth_left, 2 * half_width)
    left = side_section(depth_left, slope, cut_slope, fill_slope)
    right = side_section(depth_right, -slope, cut_slope, fill_slope)
    return {
        'cut': road_cut + left[0] + right[0],
        'fill': road_fill + left[1] + right[1],
        'slopeWidth': left[2] + right[2],
        'wall': left[3] + right[3],
        'left': left,
        'right': right
    }


#
# Road engineering
#

class Design:
    """Road design parameters and unit costs (per plan unit)"""

    def __init__(self, plan, args):
        self.feet = plan['units'] == 'feet'
        criteria = plan.get('criteria', {})
        max_grade = criteria.get('maxGrade', 12) / 100
        self.grade = (args.grade / 100) if args.grade else max(max_grade - 0.01, max_grade * 0.9)
        self.switchback_grade = min(args.switchback_grade / 100, self.grade)
        self.min_radius = criteria.get('minRadius', 50 if self.feet else 15)
        self.rock_cut_slope = criteria.get('rockCutSlope', 0.5)
        self.width = args.width if args.width else (14 if self.feet else 4.3)
        self.half_width = self.width * 0.5
        self.surface = args.surface
        self.cut_slope = args.cut_slope
        self.fill_slope = args.fill_slope
        rates = DEFAULT_RATES | plan.get('costRates', {})
        s1 = METERS_PER_FOOT if self.feet else 1
        s2 = s1 * s1
        s3 = s2 * s1

        # Unit costs per plan unit
        self.cost_cut = rates['excavation'] * s3
        self.cost_rock = rates['rockExcavation'] * s3
        self.cost_fill = rates['embankment'] * s3
        self.cost_borrow = rates['borrow'] * s3
        self.cost_waste = rates['waste'] * s3
        self.cost_area = (rates['clearing'] + rates['erosionControl']) * s2
        self.cost_wall = rates['retainingWall'] * s2
        self.cost_length = (self.width * (rates[self.surface] + rates['clearing'] + rates['erosionControl']) * s2 +
                            rates['drainage'] * s1)
        self.cost_culvert = rates['culvertEnds'] + rates['culvert'] * (0.45 if not self.feet else 1.5 * s1) * s1 * self.width * 3
        self.shrink = rates['shrink']

        # Turnouts
        if args.turnouts is not None:
            self.turnout_spacing = args.turnouts
        else:
            self.turnout_spacing = (400 if self.feet else 120) if self.width < (16 if self.feet else 4.9) else 0
        self.bridge_fill = args.bridge_fill
        self.tie_tolerance = 1 if self.feet else 0.3


def route_search(topo, design, start, end, grade_weight, slope_weight, start_heading=None, soft_band=0.03, grade_margin=0):
    """Least-cost horizontal alignment search on a lattice with heading states (radius-constrained turns)"""
    lattice = max(topo.spacing * 0.75, design.min_radius * 0.47, max(topo.width, topo.height) / 160)
    n_x = int(topo.width / lattice) + 1
    n_y = int(topo.height / lattice) + 1
    xs = np.arange(n_x) * lattice
    ys = np.arange(n_y) * lattice
    grid_x, grid_y = np.meshgrid(xs, ys)
    node_z = topo.elevation(grid_x, grid_y)
    blocked = np.zeros_like(grid_x, dtype=bool)
    for polygon in topo.polygons('exclusion'):
        blocked |= points_in_polygon(grid_x, grid_y, polygon)
    rock_polygons = topo.polygons('rock')
    streams = topo.streams()

    # The 16 move directions, in angle order
    moves = [(1, 0), (2, 1), (1, 1), (1, 2), (0, 1), (-1, 2), (-1, 1), (-2, 1),
             (-1, 0), (-2, -1), (-1, -1), (-1, -2), (0, -1), (1, -2), (1, -1), (2, -1)]

    # A move is at most two lattice steps, so only the nodes near a stream segment can cross it
    node_points = np.stack([grid_x, grid_y], axis=-1)
    margin = 3 * lattice

    def lattice_slice(a, b, count):
        return slice(max(0, math.floor((min(a, b) - margin) / lattice)), min(count, math.ceil((max(a, b) + margin) / lattice) + 1))

    # Precompute each move's cost from every node
    move_costs = []
    move_turn_costs = []
    for dx, dy in moves:
        length = math.hypot(dx, dy) * lattice
        ux = dx * lattice / length
        uy = dy * lattice / length
        x2 = grid_x + dx * lattice
        y2 = grid_y + dy * lattice
        valid = topo.inside(x2, y2)
        z2 = topo.elevation(x2, y2)
        mid_x = (grid_x + x2) * 0.5
        mid_y = (grid_y + y2) * 0.5
        gx, gy = topo.gradient(mid_x, mid_y)
        side_slope = -uy * gx + ux * gy
        ground_grade = np.abs(z2 - node_z) / length

        # Bench section earthwork at the ground line, walls where the slope is too steep
        section = cross_section(np.zeros_like(side_slope), side_slope, design.half_width, design.cut_slope, design.fill_slope)
        rock = np.zeros_like(valid)
        for polygon in rock_polygons:
            rock |= points_in_polygon(mid_x, mid_y, polygon)
        cut_cost = np.where(rock, design.cost_rock, design.cost_cut)
        cost = length * (design.cost_length + slope_weight * (
            section['cut'] * cut_cost + section['fill'] * design.cost_fill +
            section['slopeWidth'] * design.cost_area + section['wall'] * design.cost_wall))

        # Excess climb - climb beyond the design grade must be absorbed by earthwork (soft, up to 3% over the design
        # grade), or it makes the end unreachable (hard)
        # Turning moves are limited to the switchback grade.
        def excess_cost(limit_grade, ground_grade=ground_grade, length=length):
            excess = np.maximum(0, ground_grade - (limit_grade - grade_margin)) * length
            soft = np.minimum(excess, soft_band * length)
            return grade_weight * (soft * design.cost_length * 15 + (excess - soft) * design.cost_length * 300)
        cost_turn = cost + excess_cost(design.switchback_grade)
        cost = cost + excess_cost(design.grade)

        # Stream crossings (only the nodes near each stream segment)
        move_points = np.stack([x2, y2], axis=-1)
        for _, stream in streams:
            for ix_point in range(1, len(stream)):
                (sx1, sy1), (sx2, sy2) = stream[ix_point - 1], stream[ix_point]
                rows = lattice_slice(sy1, sy2, n_y)
                cols = lattice_slice(sx1, sx2, n_x)
                crosses, _ = segments_intersect(node_points[rows, cols], move_points[rows, cols], stream[ix_point - 1], stream[ix_point])
                cost[rows, cols] += np.where(crosses, design.cost_culvert, 0)

        # Blocked moves
        x2_index = np.clip(np.arange(n_x) + dx, 0, n_x - 1)
        y2_index = np.clip(np.arange(n_y) + dy, 0, n_y - 1)
        blocked2 = blocked[np.ix_(y2_index, x2_index)]
        allowed = valid & ~blocked & ~blocked2
        move_costs.append(np.where(allowed, cost, np.inf))
        move_turn_costs.append(np.where(allowed, cost_turn, np.inf))

    def nearest_node(point):
        return (min(n_y - 1, max(0, round(point[1] / lattice))), min(n_x - 1, max(0, round(point[0] / lattice))))

    start_node = nearest_node(start)
    end_node = nearest_node(end)

    # Dijkstra over (row, col, heading) states
    n_moves = len(moves)
    best = np.full((n_y, n_x, n_moves + 1), np.inf)
    parent = {}
    first_heading = n_moves if start_heading is None else start_heading
    heap = [(0.0, start_node[0], start_node[1], first_heading)]
    best[start_node[0], start_node[1], first_heading] = 0
    turn_penalty = design.cost_length * lattice * 0.15
    final_state = None
    while heap:
        cost, row, col, heading = heapq.heappop(heap)
        if cost > best[row, col, heading]:
            continue
        if (row, col) == end_node:
            final_state = (row, col, heading)
            break
        headings = range(n_moves) if heading == n_moves else ((heading - 1) % n_moves, heading, (heading + 1) % n_moves)
        for next_heading in headings:
            if heading in (n_moves, next_heading):
                move_cost = move_costs[next_heading][row, col]
            else:
                move_cost = move_turn_costs[next_heading][row, col] + turn_penalty
            if not np.isfinite(move_cost):
                continue
            dx, dy = moves[next_heading]
            next_row = row + dy
            next_col = col + dx
            next_cost = cost + move_cost
            if next_cost < best[next_row, next_col, next_heading]:
                best[next_row, next_col, next_heading] = next_cost
                parent[(next_row, next_col, next_heading)] = (row, col, heading)
                heapq.heappush(heap, (next_cost, next_row, next_col, next_heading))
    if final_state is None:
        raise SystemExit('error: no route found (blocked by exclusion areas or the topography boundary?)')

    # Trace the path
    path = []
    state = final_state
    while state is not None:
        path.append((state[1] * lattice, state[0] * lattice))
        state = parent.get(state)
    path.reverse()
    path[0] = tuple(start)
    path[-1] = tuple(end)
    return path, lattice, final_state[2]


def smooth_curves(points, interval, min_radius):
    """Resample a polyline and smooth it (keeping the endpoints) until its curves meet the minimum radius"""
    x, y, _ = resample_polyline(points, interval)
    for _ in range(400):
        radius = turn_radius(x, y)
        if radius[2:-2].min(initial=np.inf) >= min_radius * 1.1:
            break
        x[1:-1] = (x[:-2] + 2 * x[1:-1] + x[2:]) * 0.25
        y[1:-1] = (y[:-2] + 2 * y[1:-1] + y[2:]) * 0.25
    return np.column_stack([x, y])


def polyline_stations(x, y):
    """Get the stations (cumulative lengths) of a polyline's points"""
    return np.concatenate([[0], np.cumsum(np.hypot(np.diff(x), np.diff(y)))])


def resample_polyline(points, interval):
    """Resample a polyline at an even interval - returns its x and y arrays and their stations"""
    points = np.array(points, dtype=np.float64)
    stations = polyline_stations(points[:, 0], points[:, 1])
    length = stations[-1]
    count = max(2, int(math.ceil(length / interval)) + 1)
    sample_stations = np.linspace(0, length, count)
    x = np.interp(sample_stations, stations, points[:, 0])
    y = np.interp(sample_stations, stations, points[:, 1])
    return x, y, sample_stations


def turn_radius(x, y):
    """Compute the circumradius at each polyline point (infinite at the ends and on straight runs)"""
    radius = np.full(len(x), np.inf)
    ax, ay = x[:-2], y[:-2]
    bx, by = x[1:-1], y[1:-1]
    cx, cy = x[2:], y[2:]
    cross = np.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax))
    with np.errstate(divide='ignore', invalid='ignore'):
        r = np.hypot(bx - ax, by - ay) * np.hypot(cx - bx, cy - by) * np.hypot(cx - ax, cy - ay) / (2 * cross)
    radius[1:-1] = np.where(cross > 1e-9, r, np.inf)
    return radius


def design_profile(topo, design, x, y, stations, existing=None):
    """Design the vertical profile by dynamic programming - minimum earthwork cost within the grade limits. Within an
    existing road (the "existing" station mask), the profile follows the ground."""
    ds = stations[1] - stations[0]
    ground = topo.elevation(x, y)
    existing = np.zeros(len(x), dtype=bool) if existing is None else existing
    heading_x = np.gradient(x)
    heading_y = np.gradient(y)
    heading_length = np.maximum(np.hypot(heading_x, heading_y), 1e-9)
    ux = heading_x / heading_length
    uy = heading_y / heading_length
    gx, gy = topo.gradient(x, y)
    side_slope = -uy * gx + ux * gy
    rock = np.zeros(len(x), dtype=bool)
    for polygon in topo.polygons('rock'):
        rock |= points_in_polygon(x, y, polygon)
    cut_slope = np.where(rock, design.rock_cut_slope, design.cut_slope)

    # Grade limits - tight curves use the switchback grade
    radius = turn_radius(x, y)
    tight = np.convolve((radius < 1.5 * design.min_radius).astype(float), np.ones(3), mode='same') > 0
    grade_limit = np.where(tight, design.switchback_grade, design.grade)

    # Elevation levels
    # (the resolution makes the design grade's window a whole number of levels)
    resolution = design.grade * ds / 24
    max_depth = (60 if design.feet else 18)
    z_min = ground.min() - max_depth
    z_max = ground.max() + max_depth
    levels = np.arange(z_min, z_max + resolution, resolution)
    n_levels = len(levels)

    # Station costs at every level
    depth = ground[:, None] - levels[None, :]
    section = cross_section(depth, side_slope[:, None], design.half_width, cut_slope[:, None], design.fill_slope)
    cut_unit = np.where(rock, design.cost_rock, design.cost_cut)[:, None]
    ground_level = np.clip(np.round((ground - z_min) / resolution).astype(int), 0, n_levels - 1)

    def solve(balance):
        # balance > 0 makes fill more expensive and cut cheaper (to reduce borrow), < 0 the reverse
        station_cost = ds * (section['cut'] * (cut_unit - balance * design.shrink) + section['fill'] * (design.cost_fill + balance) +
                             section['slopeWidth'] * design.cost_area + section['wall'] * design.cost_wall)
        # An existing road is at the ground, with no earthwork
        station_cost[existing] = np.inf
        station_cost[existing, ground_level[existing]] = 0
        n = len(ground)
        total = np.full(n_levels, np.inf)
        start_level = int(np.argmin(np.abs(levels - ground[0])))
        total[start_level] = station_cost[0, start_level]
        back = np.zeros((n, n_levels), dtype=np.int32)
        for ix in range(1, n):
            # Within an existing road (or where the grade limit can't reach one), any grade
            if existing[ix] and (existing[ix - 1] or not np.isfinite(total).any()):
                arg = int(np.argmin(total))
                back[ix] = arg
                total = np.full(n_levels, total[arg]) + station_cost[ix]
                continue
            previous = total
            window = int(grade_limit[ix] * ds / resolution + 1e-6)
            padded = np.concatenate([np.full(window, np.inf), total, np.full(window, np.inf)])
            windows = np.lib.stride_tricks.sliding_window_view(padded, 2 * window + 1)
            arg = np.argmin(windows, axis=1)
            back[ix] = np.arange(n_levels) + arg - window
            total = windows[np.arange(n_levels), arg] + station_cost[ix]
            if existing[ix] and not np.isfinite(total[ground_level[ix]]):
                # The grade limit can't reach the existing road's ground - break grade at the junction
                arg = int(np.argmin(previous))
                back[ix, ground_level[ix]] = arg
                total[ground_level[ix]] = previous[arg] + station_cost[ix, ground_level[ix]]
        end_level = int(np.argmin(np.abs(levels - ground[-1])))
        if not np.isfinite(total[end_level]):
            # The end elevation is unreachable within the grade limits - end at the best reachable level
            end_level = int(np.argmin(np.abs(np.where(np.isfinite(total), levels, np.inf) - ground[-1])))
        path = np.zeros(n, dtype=np.int32)
        path[-1] = end_level
        for ix in range(n - 1, 0, -1):
            path[ix - 1] = back[ix, path[ix]]
        index = np.arange(n)
        cut = (section['cut'][index, path]).sum() * ds
        fill = (section['fill'][index, path]).sum() * ds
        supply = cut * design.shrink
        true_cost = (station_cost[index, path].sum() - balance * (fill - supply) +
                     max(0, fill - supply) * design.cost_borrow + max(0, supply - fill) * design.cost_waste)
        return true_cost, levels[path]

    # Balance cut and fill - try several balance prices and keep the lowest true cost
    best = None
    for balance in (0, design.cost_borrow * 0.5, design.cost_borrow, -design.cost_waste * 0.5, -design.cost_waste):
        result = solve(balance)
        if best is None or result[0] < best[0]:
            best = result
    profile = best[1]

    # Vertical curves - a moving average preserves the grade limits
    # (odd reflection at the ends keeps the end elevations and the grades)
    half = int(round((50 if design.feet else 15) / ds))
    if half > 0 and len(profile) > 2 * half + 1:
        padded = np.concatenate([2 * profile[0] - profile[half:0:-1], profile, 2 * profile[-1] - profile[-2:-half - 2:-1]])
        profile = np.convolve(padded, np.ones(2 * half + 1) / (2 * half + 1), mode='valid')
    profile[existing] = ground[existing]
    return profile, ground, side_slope


def design_structures(topo, design, x, y, stations, profile, side_slope, existing_roads):
    """Place retaining walls (slopes that don't daylight), culverts, bridges, and turnouts - none within the existing roads
    ([station, end station] ranges), which are added as existing road structures"""
    ds = stations[1] - stations[0]
    length = stations[-1]
    existing = existing_mask(stations, existing_roads)

    def in_existing(station):
        return any(start - 1e-6 <= station <= end + 1e-6 for start, end in existing_roads)
    ground = topo.elevation(x, y)
    depth = ground - profile
    section = cross_section(depth, side_slope, design.half_width, design.cut_slope, design.fill_slope)
    structures = []

    # Stream crossings
    crossings = []
    points = np.column_stack([x, y])
    for name, stream in topo.streams():
        for ix_point in range(1, len(stream)):
            crosses, t = segments_intersect(points[:-1], points[1:], stream[ix_point - 1], stream[ix_point])
            for ix_segment in np.nonzero(crosses)[0]:
                station = stations[ix_segment] + t[ix_segment] * ds
                if not in_existing(station):
                    crossings.append((station, name))

    # Bridges for deep stream crossing fills - a single span (at most 150 feet / 45 meters) over the deepest fill
    bridges = []
    if design.bridge_fill:
        max_span = 150 if design.feet else 45
        for station, name in crossings:
            ix_cross = int(round(station / ds))
            if -depth[ix_cross] > design.bridge_fill:
                ix_start = ix_cross
                ix_end = ix_cross
                while (ix_end - ix_start + 1) * ds < max_span:
                    fill_before = -depth[ix_start - 1] if ix_start > 0 else 0
                    fill_after = -depth[ix_end + 1] if ix_end < len(depth) - 1 else 0
                    if max(fill_before, fill_after) <= design.bridge_fill * 0.5:
                        break
                    if fill_before >= fill_after:
                        ix_start -= 1
                    else:
                        ix_end += 1
                bridges.append((stations[ix_start], stations[ix_end]))
                structures.append({'type': 'bridge', 'station': round(stations[ix_start], 1), 'endStation': round(stations[ix_end], 1),
                                   'name': f'{name} bridge'})

    def in_bridge(station):
        return any(start <= station <= end for start, end in bridges)

    # Culverts at stream crossings and profile sag points
    culvert_stations = []
    for station, name in crossings:
        if not in_bridge(station):
            culvert_stations.append(station)
            structures.append({'type': 'culvert', 'station': round(station, 1), 'diameter': 3 if design.feet else 0.9,
                               'name': f'{name} culvert'})
    tolerance = max(design.width, topo.spacing) * 2
    for ix in range(1, len(profile) - 1):
        if profile[ix] < profile[ix - 1] and profile[ix] <= profile[ix + 1]:
            station = stations[ix]
            if not in_bridge(station) and not existing[ix] and all(abs(station - other) > tolerance for other in culvert_stations):
                culvert_stations.append(station)
                structures.append({'type': 'culvert', 'station': round(station, 1), 'name': 'Sag cross drain'})

    # Retaining walls where a slope does not daylight
    bridged = np.array([in_bridge(station) for station in stations])
    for side_name, side in (('left', section['left']), ('right', section['right'])):
        wall = (side[3] > 0) & ~bridged & ~existing
        ix = 0
        while ix < len(wall):
            if wall[ix]:
                ix_end = ix
                while ix_end + 1 < len(wall) and wall[ix_end + 1]:
                    ix_end += 1
                structures.append({'type': 'retainingWall', 'station': round(max(0, stations[ix] - ds), 1),
                                   'endStation': round(min(length, stations[ix_end] + ds), 1), 'side': side_name})
                ix = ix_end + 1
            else:
                ix += 1

    # Turnouts on the flatter side (toward the uphill side, where the cut is cheaper)
    if design.turnout_spacing > 0 and length > design.turnout_spacing * 0.375:
        turnout_length = 50 if design.feet else 15
        count = max(1, int(length / design.turnout_spacing))
        for ix_turnout in range(count):
            center = length * (ix_turnout + 1) / (count + 1)
            ix_center = int(round(center / ds))
            if existing[ix_center]:
                continue
            side_name = 'left' if side_slope[ix_center] > 0 else 'right'
            structures.append({'type': 'turnout', 'station': round(center - turnout_length / 2, 1),
                               'endStation': round(center + turnout_length / 2, 1), 'side': side_name})

    # Existing roads
    for start, end in existing_roads:
        structures.append({'type': 'existingRoad', 'station': round(start, 1), 'endStation': round(end, 1), 'name': 'Existing road'})

    structures.sort(key=lambda structure: structure['station'])
    return structures


def existing_mask(stations, existing_roads):
    """Get the station mask of the existing roads ([station, end station] ranges)"""
    mask = np.zeros(len(stations), dtype=bool)
    for start, end in existing_roads:
        mask |= (stations >= start - 1e-6) & (stations <= end + 1e-6)
    return mask


def command_route(args):
    """The "route" and "profile" subcommands - engineer a road option, or re-design an existing option's profile and structures"""
    plan = load_json(args.plan)
    topo = Topo(plan)
    design = Design(plan, args)
    options = plan.setdefault('options', [])
    existing_option = next((option for option in options if option['name'] == args.name), None)

    # The existing roads - the argument ranges, or for profile, the option's existing road structures
    if args.existing_road:
        existing_roads = [tuple(float(value) for value in text.split(',')) for text in args.existing_road]
    elif args.command == 'profile' and existing_option is not None:
        existing_roads = [(structure['station'], structure['endStation']) for structure in existing_option.get('structures', [])
                          if structure['type'] == 'existingRoad']
    else:
        existing_roads = []

    if args.command == 'route':
        # Horizontal alignment search through the via points. If the profile can't reach the end elevation within the
        # grade limits, search again with stricter grade penalties.
        waypoints = [(plan['start']['x'], plan['start']['y'])]
        for via in args.via or []:
            via_x, via_y = (float(value) for value in via.split(','))
            waypoints.append((via_x, via_y))
        waypoints.append((plan['end']['x'], plan['end']['y']))
        for soft_band, grade_margin in ((0.03, 0), (0.01, 0.005), (0, 0.015), (0, 0.03)):
            path = []
            heading = None
            for ix_waypoint in range(1, len(waypoints)):
                leg, lattice, heading = route_search(topo, design, waypoints[ix_waypoint - 1], waypoints[ix_waypoint],
                                                     args.grade_weight, args.slope_weight, heading, soft_band, grade_margin)
                path.extend(leg if not path else leg[1:])
            interval = min(lattice, topo.spacing) * 0.5
            path = smooth_curves(path, interval, design.min_radius)
            x, y, stations = resample_polyline(path, interval)
            profile, ground, side_slope = design_profile(topo, design, x, y, stations, existing_mask(stations, existing_roads))
            if abs(profile[-1] - ground[-1]) <= design.tie_tolerance:
                break
            print(f'The profile ends {ground[-1] - profile[-1]:.1f} {plan["units"]} below the end point - searching with stricter grades')
    else:
        if existing_option is None:
            raise SystemExit(f'error: no option named "{args.name}"')
        path = [(point['x'], point['y']) for point in existing_option['alignment']]
        x, y, stations = resample_polyline(path, topo.spacing * 0.5)
        profile, ground, side_slope = design_profile(topo, design, x, y, stations, existing_mask(stations, existing_roads))

    # Structures (the existing roads within the road's length, measured along the alignment points as the viewer does)
    alignment_length = math.floor(np.hypot(np.diff(x), np.diff(y)).sum() * 10) / 10
    existing_roads = [(start, min(end, alignment_length)) for start, end in existing_roads if start < alignment_length]
    structures = design_structures(topo, design, x, y, stations, profile, side_slope, existing_roads)

    # Create the option
    description = args.description or (existing_option.get('description') if existing_option else None)
    option = {'name': args.name} | ({'description': description} if description else {}) | {
        'section': {'width': design.width, 'cutSlope': design.cut_slope, 'fillSlope': design.fill_slope, 'surface': design.surface},
        'alignment': [{'x': round(float(px), 2), 'y': round(float(py), 2), 'z': round(float(pz), 2)}
                      for px, py, pz in zip(x, y, profile)],
        'structures': structures
    }
    if existing_option is not None:
        options[options.index(existing_option)] = option
    else:
        options.append(option)
    write_plan(args.plan, order_plan(plan))

    # Report (the new road's grades)
    mask = existing_mask(stations, existing_roads)
    grades = np.where(mask[1:] & mask[:-1], 0, np.abs(np.diff(profile)) / np.diff(stations) * 100)
    depth = ground - profile
    print(f'Option "{args.name}": {stations[-1]:.0f} {plan["units"]} long, {len(x)} alignment points, '
          f'max grade {grades.max():.1f}%, max cut {max(0, depth.max()):.1f}, max fill {max(0, -depth.min()):.1f}')
    print(f'Structures: {", ".join(f"{s["type"]} at {s["station"]}" for s in structures) or "none"}')
    for label, ix_end in (('start', 0), ('end', -1)):
        if abs(profile[ix_end] - ground[ix_end]) > design.tie_tolerance:
            print(f'WARNING: the profile {label} is {profile[ix_end] - ground[ix_end]:+.1f} {plan["units"]} from the ground - '
                  'the grade limit can\'t be met on this alignment (try other via points or a longer route)')
    print(f'Wrote {args.plan} - run "make evaluate FILE={args.plan}" for the full analysis and cost')


#
# Plotting
#

def plot_plan(plan, output, contours_model=None, contours_dir=None):
    """Plot a road plan model - contours, features, and options - optionally over the map image"""
    import matplotlib # pylint: disable=import-outside-toplevel
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt # pylint: disable=import-outside-toplevel

    topo = Topo(plan)
    fig, axes = plt.subplots(figsize=(12, 12 * max(0.3, topo.height / max(topo.width, 1e-9))), dpi=110)

    # Background map image
    if contours_model is not None and contours_model.get('image'):
        image = load_image(os.path.join(contours_dir, contours_model['image']))
        georef = georeference(contours_model, contour_points(contours_model, contours_dir))
        x0, y0 = pixel_to_plan(georef, 0, image.height)
        x1, y1 = pixel_to_plan(georef, image.width, 0)
        axes.imshow(np.asarray(image), extent=(x0, x1, y0, y1), alpha=0.55)
        axes.add_patch(plt.Rectangle((0, 0), topo.width, topo.height, fill=False, edgecolor='magenta', linestyle=':'))

    # Grid contours
    interval = plan['topography'].get('contourInterval') or nice_number((topo.z.max() - topo.z.min()) / 25)
    grid_x = np.arange(topo.n_cols) * topo.spacing
    grid_y = (topo.n_rows - 1 - np.arange(topo.n_rows)) * topo.spacing
    levels = np.arange(math.floor(topo.z.min() / interval) * interval, topo.z.max() + interval, interval)
    contour_set = axes.contour(grid_x, grid_y, topo.z, levels=levels, colors='saddlebrown', linewidths=0.6)
    axes.clabel(contour_set, levels[::5], fontsize=7, fmt='%g')

    # Features
    for feature in topo.features:
        points = xy_array(feature['points'])
        if feature['type'] != 'stream':
            points = np.vstack([points, points[:1]])
        style = {'stream': ('royalblue', '-'), 'rock': ('dimgray', '--'), 'exclusion': ('red', '--')}[feature['type']]
        axes.plot(points[:, 0], points[:, 1], color=style[0], linestyle=style[1], linewidth=1.5)

    # Options
    colors = ['crimson', 'darkorange', 'purple', 'teal', 'olive', 'navy']
    for ix_option, option in enumerate(plan.get('options', [])):
        color = colors[ix_option % len(colors)]
        alignment = xy_array(option['alignment'])
        axes.plot(alignment[:, 0], alignment[:, 1], color=color, linewidth=2.5, label=f'{ix_option}: {option["name"]}')
        stations = polyline_stations(alignment[:, 0], alignment[:, 1])
        for structure in option.get('structures', []):
            if structure['type'] == 'existingRoad':
                # The existing road section is dashed over the option's line
                inside = (stations >= structure['station'] - 1e-6) & (stations <= structure['endStation'] + 1e-6)
                axes.plot(alignment[inside, 0], alignment[inside, 1], color='black', linewidth=1.5, linestyle=(0, (4, 3)))
                continue
            sx = np.interp(structure['station'], stations, alignment[:, 0])
            sy = np.interp(structure['station'], stations, alignment[:, 1])
            marker = {'culvert': 'o', 'retainingWall': 's', 'bridge': '^', 'turnout': 'D'}[structure['type']]
            axes.plot(sx, sy, marker=marker, color=color, markersize=6, markeredgecolor='black')
        tick = nice_number(stations[-1] / 8)
        for station in np.arange(tick, stations[-1], tick):
            sx = np.interp(station, stations, alignment[:, 0])
            sy = np.interp(station, stations, alignment[:, 1])
            axes.annotate(f'{station:.0f}', (sx, sy), fontsize=7, color=color)

    # Start and end
    for endpoint, color in (('start', 'green'), ('end', 'red')):
        point = plan[endpoint]
        axes.plot(point['x'], point['y'], 'o', color=color, markersize=10, markeredgecolor='white')
        axes.annotate(point.get('label', endpoint), (point['x'], point['y']), xytext=(6, 6), textcoords='offset points',
                      fontsize=10, color=color, weight='bold')

    axes.set_aspect('equal')
    axes.set_xlim(0, topo.width)
    axes.set_ylim(0, topo.height)
    axes.set_title(f'{plan.get("title", "")} - contours every {interval:g} {plan["units"]}')
    if plan.get('options'):
        axes.legend(loc='upper right', fontsize=8)
    fig.tight_layout()
    fig.savefig(output)
    plt.close(fig)
    print(f'Wrote {output}')


def command_plot(args):
    """The "plot" subcommand - plot a road plan model"""
    contours_model = None
    contours_dir = None
    if args.contours:
        contours_dir = os.path.dirname(os.path.abspath(args.contours))
        contours_model = load_json(args.contours)
    plot_plan(load_json(args.plan), args.output, contours_model, contours_dir)


if __name__ == '__main__':
    main(sys.argv[1:])
