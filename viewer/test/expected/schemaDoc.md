==== Top
# struct Top

| Name   | Type                         |
|--------|------------------------------|
| thing  | [Thing](#struct-thing)       |
| plains | [Plains](#typedef-plains)    |
| none   | [EmptyEnum](#enum-emptyenum) |

---

## Referenced Types

### struct Base

A base struct

| Name | Type | Attributes | Description    |
|------|------|------------|----------------|
| id   | int  | value > 0  | The identifier |

### enum BaseColor

| Value | Description   |
|-------|---------------|
| red   | The color red |

### union Choice

A choice

| Name   | Type   |
|--------|--------|
| number | int    |
| text   | string |

### enum Color

Bases: [BaseColor](#enum-basecolor)

The colors

| Value | Description   |
|-------|---------------|
| red   | The color red |
| green |               |
| blue  |               |

### struct Empty

The struct is empty.

### enum EmptyEnum

The enum is empty.

### enum Plain

| Value |
|-------|
| a     |
| b     |

### typedef Plains

| Type                    |
|-------------------------|
| [Plain](#enum-plain) [] |

### typedef Score

A score

| Type  | Attributes                |
|-------|---------------------------|
| float | value >= 0<br>value < 100 |

### struct Thing

Bases: [Base](#struct-base)

A thing
with two documentation lines

and a second paragraph

| Name        | Type                          | Attributes                                                      | Description         |
|-------------|-------------------------------|-----------------------------------------------------------------|---------------------|
| id          | int                           | value > 0                                                       | The identifier      |
| name        | string                        | len(value) > 0<br>len(value) <= 20                              | The name            |
| color       | [Color](#enum-color)          | optional                                                        |                     |
| empty       | [Empty](#struct-empty)        | optional                                                        |                     |
| tags        | string []                     | optional<br>len(array) > 0<br>len(array) < 10<br>len(value) > 0 | The tags            |
| scores      | float {}                      | optional<br>len(dict) == 2<br>value >= 0<br>value <= 1          | The scores by name  |
| colorCounts | [Color](#enum-color) : int {} | optional<br>nullable                                            | The colors by color |
| choice      | [Choice](#union-choice)       |                                                                 |                     |
| score       | [Score](#typedef-score)       |                                                                 |                     |
==== Thing
# struct Thing

Bases: [Base](#struct-base)

A thing
with two documentation lines

and a second paragraph

| Name        | Type                          | Attributes                                                      | Description         |
|-------------|-------------------------------|-----------------------------------------------------------------|---------------------|
| id          | int                           | value > 0                                                       | The identifier      |
| name        | string                        | len(value) > 0<br>len(value) <= 20                              | The name            |
| color       | [Color](#enum-color)          | optional                                                        |                     |
| empty       | [Empty](#struct-empty)        | optional                                                        |                     |
| tags        | string []                     | optional<br>len(array) > 0<br>len(array) < 10<br>len(value) > 0 | The tags            |
| scores      | float {}                      | optional<br>len(dict) == 2<br>value >= 0<br>value <= 1          | The scores by name  |
| colorCounts | [Color](#enum-color) : int {} | optional<br>nullable                                            | The colors by color |
| choice      | [Choice](#union-choice)       |                                                                 |                     |
| score       | [Score](#typedef-score)       |                                                                 |                     |

---

## Referenced Types

### struct Base

A base struct

| Name | Type | Attributes | Description    |
|------|------|------------|----------------|
| id   | int  | value > 0  | The identifier |

### enum BaseColor

| Value | Description   |
|-------|---------------|
| red   | The color red |

### union Choice

A choice

| Name   | Type   |
|--------|--------|
| number | int    |
| text   | string |

### enum Color

Bases: [BaseColor](#enum-basecolor)

The colors

| Value | Description   |
|-------|---------------|
| red   | The color red |
| green |               |
| blue  |               |

### struct Empty

The struct is empty.

### typedef Score

A score

| Type  | Attributes                |
|-------|---------------------------|
| float | value >= 0<br>value < 100 |
==== Score
# typedef Score

A score

| Type  | Attributes                |
|-------|---------------------------|
| float | value >= 0<br>value < 100 |
==== Plain
# enum Plain

| Value |
|-------|
| a     |
| b     |
