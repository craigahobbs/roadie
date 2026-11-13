// site.js - the road site model: the start and end points of a road to plan, as latitudes and longitudes, and its
// planning instructions - the input of the "site" command

import {parseSchemaMarkdown} from 'schema-markdown/lib/parser.js';
import {roadieTypes} from '../../viewer/lib/model.js';
import {validateType} from 'schema-markdown/lib/schema.js';


// The road site model's type model - the model is defined with Schema Markdown, and shares the road plan model's
// units, design criteria, and cost rates
export const siteTypes = parseSchemaMarkdown([
    '# A road site - the start and end points of a road to plan, and its planning instructions. The site\'s',
    '# topography is USGS 3D Elevation Program lidar terrain, so the site is in the United States.',
    'struct RoadSite',
    '',
    '    # The site title - it\'s the road plan\'s title',
    '    string(len > 0) title',
    '',
    '    # The unit of the road plan\'s lengths and elevations',
    '    Units units',
    '',
    '    # The road start point',
    '    SitePoint start',
    '',
    '    # The road end point',
    '    SitePoint end',
    '',
    '    # The planning instructions - the road\'s purpose, constraints, preferences, and anything else the',
    '    # road\'s engineer should know',
    '    optional string[] notes',
    '',
    '    # The areas the road must avoid (buildings, wetlands, a neighbor\'s land, etc.)',
    '    optional SiteArea[] exclusions',
    '',
    '    # The road design criteria',
    '    optional DesignCriteria criteria',
    '',
    '    # The cost rate overrides',
    '    optional CostRates costRates',
    '',
    '    # The distance the site\'s topography extends beyond the start and end points, in the plan\'s units',
    '    # (default is 30% of the distance between the points, at least 500 feet / 150 meters)',
    '    optional float(> 0) margin',
    '',
    '    # The topography grid spacing, in the plan\'s units (default is the finest spacing that keeps the',
    '    # grid within its size limit)',
    '    optional float(> 0) spacing',
    '',
    '',
    '# A road start or end point',
    'struct SitePoint',
    '',
    '    # The point\'s latitude, in decimal degrees (WGS 84) - north is positive',
    '    float(>= -90, <= 90) latitude',
    '',
    '    # The point\'s longitude, in decimal degrees (WGS 84) - east is positive, so the United States\'',
    '    # longitudes are negative',
    '    float(>= -180, <= 180) longitude',
    '',
    '    # The point label (default is "Start" or "End")',
    '    optional string(len > 0) label',
    '',
    '    # The point\'s description - what is there, and how the road joins it',
    '    optional string(len > 0) description',
    '',
    '',
    '# An area of the site',
    'struct SiteArea',
    '',
    '    # The area name',
    '    optional string(len > 0) name',
    '',
    '    # The area\'s polygon points',
    '    LatLong[len > 2] points',
    '',
    '',
    '# A latitude and longitude',
    'struct LatLong',
    '',
    '    # The latitude, in decimal degrees (WGS 84)',
    '    float(>= -90, <= 90) latitude',
    '',
    '    # The longitude, in decimal degrees (WGS 84)',
    '    float(>= -180, <= 180) longitude'
], {'types': {...roadieTypes}});


// Validate a road site model - returns an object with "site" on success, or "error" on failure
export function validateSite(siteValue) {
    let site;
    try {
        site = validateType(siteTypes, 'RoadSite', siteValue);
    } catch ({message}) {
        return {'error': message};
    }

    // A road has length
    const {start, end} = site;
    if (start.latitude === end.latitude && start.longitude === end.longitude) {
        return {'error': 'The start and end points are the same point'};
    }

    return {site};
}
