# Complex Plan

Topography: 9 x 9 grid, 10 ft spacing, 80 x 80 ft, elevations 100.0 to 164.0 ft

- start (-15.0, 20.0): ground elevation outside the topography
- end (75.0, 60.0): ground elevation 148.0
- Design criteria: maximum grade 10%, minimum radius 50 ft, maximum wall height 3 ft

## Options (lengths in ft, volumes in cy)

| Option | Length | Max Grade | Cut    | Fill | Borrow | Waste  | Warnings | Cost Score |
|--------|--------|-----------|--------|------|--------|--------|----------|------------|
| Main   | 86     | 100.0%    | 353    | 299  | 0      | 11     | 18       | 47.6       |
| Alt    | 90     | 264.0%    | 19,237 | 102  | 0      | 16,634 | 8        | 471.1      |

## Option 0: Main

| Item                     | Quantity | Cost Score | Share |
|--------------------------|---------:|-----------:|------:|
| Clearing and grubbing    | 3,351 sf |        0.6 |  1.3% |
| Common excavation        |   339 cy |        5.2 | 10.9% |
| Rock excavation          |    14 cy |        1.1 |  2.2% |
| Embankment               |   299 cy |        1.5 |  3.1% |
| Waste (export)           |    11 cy |        0.1 |  0.2% |
| Surfacing (asphalt)      | 1,049 sf |        3.9 |  8.2% |
| Ditches and cross drains |    83 ft |        1.1 |  2.4% |
| Culverts (2)             |    29 ft |       16.3 | 34.3% |
| Retaining walls          |    53 sf |        3.2 |  6.7% |
| Bridges                  |    40 sf |       10.0 | 21.1% |
| Erosion control          | 3,351 sf |        0.2 |  0.5% |
| Mobilization             |          |        4.3 |  9.1% |
| **Total**                |          |   **47.6** |       |

### Design Warnings

- Grade 20.0% exceeds the maximum grade (10%) from 0+40 to 0+50
- Grade 100.0% exceeds the maximum grade (10%) from 0+70 to 0+86
- Curve radius 6 ft at 0+70 is less than the minimum radius (50 ft)
- The alignment start is 15 ft from the plan start point
- The road grade at the start is 2.0 ft below the ground
- The alignment end is 39 ft from the plan end point
- The road is outside the topography from 0+83 to 0+86
- The road crosses an exclusion area from 0+63 to 0+66
- The fill slope does not daylight (retaining wall needed) from 0+07 to 0+30
- The fill slope does not daylight (retaining wall needed) from 0+40 to 0+43
- The fill slope does not daylight (retaining wall needed) from 0+53 to 0+80
- The cut slope does not daylight (retaining wall needed) from 0+07 to 0+13
- The cut slope does not daylight (retaining wall needed) from 0+27 to 0+43
- The cut slope does not daylight (retaining wall needed) from 0+53 to 0+73
- The retaining wall exceeds the maximum wall height from 0+00 to 0+03
- The bridge deck is below the ground from 0+46 to 0+50
- The stream crossing at 0+45 has no culvert or bridge
- The culvert at 2+00 is beyond the end of the road

### Structures

| Type           | Name            | Station      | Side  | Detail                |
|----------------|-----------------|--------------|-------|-----------------------|
| Retaining wall |                 | 0+00 to 0+05 | both  | Maximum height 6.0 ft |
| Culvert        | Creek A culvert | 0+12         |       | Diameter 2 ft         |
| Turnout        |                 | 0+20 to 0+28 | both  |                       |
| Retaining wall |                 | 0+30 to 0+38 | right | Maximum height 2.0 ft |
| Bridge         |                 | 0+46 to 0+50 |       | Span 4 ft             |
| Turnout        |                 | 0+52 to 0+58 | right |                       |
| Culvert        |                 | 2+00         |       | Diameter 1.5 ft       |

### Stations

| Station | X    | Y    | Ground | Grade | Cut/Fill | Side Slope | Left                   | Right                   | Notes   |
|---------|------|------|--------|-------|----------|------------|------------------------|-------------------------|---------|
| 0+00    | 0.0  | 20.0 | 116.0  | 114.0 | C 2.0    | 80%        | wall 6.0               | wall 2.0                |         |
| 0+07    | 6.6  | 20.0 | 116.0  | 114.0 | C 2.0    | 80%        | cut 27.0 (no daylight) | fill 9.0 (no daylight)  |         |
| 0+10    | 10.0 | 20.0 | 116.0  | 114.0 | C 2.0    | 80%        | cut 27.0 (no daylight) | fill 9.0 (no daylight)  |         |
| 0+17    | 16.6 | 20.0 | 116.0  | 114.0 | C 2.0    | 80%        | cut 5.0                | fill 9.0 (no daylight)  | rock    |
| 0+20    | 19.9 | 20.0 | 116.0  | 114.0 | C 2.0    | 80%        | cut 5.0                | fill 9.0 (no daylight)  | rock    |
| 0+27    | 26.5 | 20.0 | 116.0  | 114.0 | C 2.0    | 80%        | cut 27.0 (no daylight) | fill 9.0 (no daylight)  |         |
| 0+30    | 29.9 | 20.0 | 116.0  | 114.0 | C 2.0    | 80%        | cut 27.0 (no daylight) | fill 9.0 (no daylight)  |         |
| 0+36    | 36.5 | 20.0 | 116.0  | 114.0 | C 2.0    | 80%        | cut 27.0 (no daylight) | wall 2.0                |         |
| 0+40    | 39.8 | 20.0 | 116.0  | 114.0 | C 2.0    | 80%        | cut 27.0 (no daylight) | fill 9.0 (no daylight)  |         |
| 0+46    | 46.4 | 20.0 | 116.0  | 115.3 | C 0.7    | 80%        |                        |                         | bridge  |
| 0+50    | 49.8 | 20.0 | 116.0  | 116.0 | C 0.0    | 80%        |                        |                         | bridge  |
| 0+56    | 56.4 | 20.0 | 116.0  | 116.0 | C 0.0    | 80%        | cut 18.0 (no daylight) | fill 18.0 (no daylight) |         |
| 0+60    | 59.7 | 20.0 | 116.0  | 116.0 | C 0.0    | 80%        | cut 18.0 (no daylight) | fill 18.0 (no daylight) |         |
| 0+66    | 66.3 | 20.0 | 116.0  | 116.0 | C 0.0    | 80%        | cut 18.0 (no daylight) | fill 18.0 (no daylight) |         |
| 0+70    | 69.7 | 20.0 | 116.0  | 116.0 | C 0.0    | 80%        | cut 18.0 (no daylight) | fill 18.0 (no daylight) |         |
| 0+76    | 75.0 | 22.0 | 117.6  | 122.0 | F 4.4    | 80%        | fill 0.3               | fill 38.0 (no daylight) |         |
| 0+80    | 78.4 | 22.0 | 117.6  | 125.4 | F 7.8    | 80%        | fill 2.6               | fill 52.9 (no daylight) |         |
| 0+86    | 85.0 | 22.0 | 132.0  | 132.0 | C 0.0    | 0%         |                        |                         | outside |

## Option 1: Alt

| Item                     |  Quantity | Cost Score | Share |
|--------------------------|----------:|-----------:|------:|
| Clearing and grubbing    | 15,267 sf |        2.8 |  0.6% |
| Common excavation        | 19,237 cy |      294.1 | 62.4% |
| Embankment               |    102 cy |        0.5 |  0.1% |
| Waste (export)           | 16,634 cy |      127.2 | 27.0% |
| Surfacing (gravel)       |    720 sf |        1.3 |  0.3% |
| Ditches and cross drains |     90 ft |        1.2 |  0.3% |
| Erosion control          | 15,267 sf |        1.1 |  0.2% |
| Mobilization             |           |       42.8 |  9.1% |
| **Total**                |           |  **471.1** |       |

### Design Warnings

- Grade 264.0% exceeds the maximum grade (10%) from 0+40 to 0+90
- The alignment start is 25 ft from the plan start point
- The alignment end is 25 ft from the plan end point
- The road is outside the topography from 0+83 to 0+90
- The fill slope does not daylight (retaining wall needed) from 0+00 to 0+40
- The Creek A crossing at 0+12 has no culvert or bridge
- The stream crossing at 0+45 has no culvert or bridge
- The Creek C crossing at 0+48 has no culvert or bridge

### Stations

| Station | X    | Y    | Ground | Grade | Cut/Fill | Side Slope | Left      | Right                   | Notes   |
|---------|------|------|--------|-------|----------|------------|-----------|-------------------------|---------|
| 0+00    | 0.0  | 40.0 | 132.0  | 132.0 | C 0.0    | 80%        | cut 16.0  | fill 14.4 (no daylight) |         |
| 0+07    | 6.7  | 40.0 | 132.0  | 132.0 | C 0.0    | 80%        | cut 16.0  | fill 14.4 (no daylight) |         |
| 0+10    | 10.0 | 40.0 | 132.0  | 132.0 | C 0.0    | 80%        | cut 16.0  | fill 14.4 (no daylight) |         |
| 0+17    | 16.7 | 40.0 | 132.0  | 132.0 | C 0.0    | 80%        | cut 16.0  | fill 14.4 (no daylight) |         |
| 0+20    | 20.0 | 40.0 | 132.0  | 132.0 | C 0.0    | 80%        | cut 16.0  | fill 14.4 (no daylight) |         |
| 0+27    | 26.7 | 40.0 | 132.0  | 132.0 | C 0.0    | 80%        | cut 16.0  | fill 14.4 (no daylight) |         |
| 0+30    | 30.0 | 40.0 | 132.0  | 132.0 | C 0.0    | 80%        | cut 16.0  | fill 14.4 (no daylight) |         |
| 0+37    | 36.7 | 40.0 | 132.0  | 132.0 | C 0.0    | 80%        | cut 16.0  | fill 14.4 (no daylight) |         |
| 0+40    | 40.0 | 40.0 | 132.0  | 132.0 | C 0.0    | 80%        | cut 16.0  | fill 14.4 (no daylight) |         |
| 0+47    | 46.7 | 40.0 | 132.0  | 114.4 | C 17.6   | 80%        | cut 104.0 | cut 8.0                 |         |
| 0+50    | 50.0 | 40.0 | 132.0  | 105.6 | C 26.4   | 80%        | cut 148.0 | cut 12.9                |         |
| 0+57    | 56.7 | 40.0 | 132.0  | 88.0  | C 44.0   | 80%        | cut 236.0 | cut 22.7                |         |
| 0+60    | 60.0 | 40.0 | 132.0  | 79.2  | C 52.8   | 80%        | cut 280.0 | cut 27.6                |         |
| 0+67    | 66.7 | 40.0 | 132.0  | 61.6  | C 70.4   | 80%        | cut 368.0 | cut 37.3                |         |
| 0+70    | 70.0 | 40.0 | 132.0  | 52.8  | C 79.2   | 80%        | cut 412.0 | cut 42.2                |         |
| 0+77    | 76.7 | 40.0 | 132.0  | 35.2  | C 96.8   | 80%        | cut 500.0 | cut 52.0                |         |
| 0+80    | 80.0 | 40.0 | 132.0  | 26.4  | C 105.6  | 80%        | cut 544.0 | cut 56.9                |         |
| 0+87    | 86.7 | 40.0 | 8.8    | 8.8   | C 0.0    | 0%         |           |                         | outside |
| 0+90    | 90.0 | 40.0 | 0.0    | 0.0   | C 0.0    | 0%         |           |                         | outside |

