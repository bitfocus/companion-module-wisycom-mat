## Wisycom MAT RF Matrix

Controls the Wisycom MAT244 and MAT288 programmable RF matrix/combiner via TCP.

> **Note:** The MAT only supports one TCP connection at a time. This module cannot be used in parallel with Wisycom Manager or any other control software. You must close Wisycom Manager before connecting this module.

---

## Configuration

| Field    | Description                                   |
| -------- | --------------------------------------------- |
| Host     | IP address of the MAT device                  |
| Port     | TCP port (default: 2101)                      |
| Password | Device password, if set (leave blank if none) |

---

## Matrix Configurations

The MAT supports three routing configurations selectable via the device menu. The active configuration determines how many antenna zones are available and whether diversity (A+B) is active.

### MAT288 (always diversity — every zone has an A and B input)

| Configuration                 | Description                                 | Zones |
| ----------------------------- | ------------------------------------------- | ----- |
| Diversity Combiner 8:1 (+7dB) | All 8 zones combined to 1 output pair       | 8     |
| Diversity Combiner 8:4 (0dB)  | 8 zones to 4 output pairs                   | 8     |
| 2× Diversity Combiner 4:2     | Two independent 4:2 groups (zones 1–4, 5–8) | 8     |

### MAT244 (diversity only in 4:2 mode)

| Configuration                 | Description                  | Zones | Diversity   |
| ----------------------------- | ---------------------------- | ----- | ----------- |
| Combiner 8:1 (+7dB)           | 8 zones combined to 1 output | 8     | No (A only) |
| Combiner 8:4 (0dB)            | 8 zones to 4 outputs         | 8     | No (A only) |
| Diversity Combiner 4:2 (+7dB) | 4 zones to 2 output pairs    | 4     | Yes (A+B)   |

Zone dropdowns in actions and feedbacks are automatically updated to reflect the current device model and configuration.

---

## Actions

### Save Parameters

Write all the parameters into the memory of device.

### Set Name

Set the name of the device or a specific antenna zone. Maximum 8 characters. Supports Companion variables.

| Option      | Description                            |
| ----------- | -------------------------------------- |
| Destination | Device (rack label) or a specific zone |
| Name        | New name string (max 8 chars)          |

---

### Set Display

Set the front-panel display timeout and brightness.

| Option            | Description                       |
| ----------------- | --------------------------------- |
| Timeout (seconds) | Screen timeout in seconds (0–255) |
| Brightness        | Display brightness level (0–255)  |

---

### Set Lock

Lock or unlock the front panel controls.

| Option | Description                      |
| ------ | -------------------------------- |
| Locked | Check to lock, uncheck to unlock |

---

### Set Message

Display a temporary message on the device screen. The message is cleared by any user interaction on the device, or by sending this action again with an empty message. Supports Companion variables.

| Option        | Description                             |
| ------------- | --------------------------------------- |
| Blink Display | Flash the display alongside the message |
| Message       | Text to display (max 40 chars)          |

---

### Set Antenna Zone Active

Enable or disable a specific antenna zone.

| Option | Description                         |
| ------ | ----------------------------------- |
| Zone   | Antenna zone to control             |
| Active | Check to enable, uncheck to disable |

---

### Set Antenna Diversity

Set the RF diversity mode for an antenna zone.

| Option    | Description             |
| --------- | ----------------------- |
| Zone      | Antenna zone to control |
| Diversity | A, B, or A+B            |

> **Note:** On MAT244 in 8:1 or 8:4 configuration, only A is physically connected. Diversity setting is still accepted by the device but B has no effect.

---

### Set Antenna Boost

Set the boost amplifier mode for an antenna zone. On MAT244 in non-diversity configurations, only A-path options are shown (Off, A, High A).

| Option | Description                                                                 |
| ------ | --------------------------------------------------------------------------- |
| Zone   | Antenna zone to control                                                     |
| Boost  | Off / A / -B / A+B / High A / -High B / High A+B / A+High B / High A+High B |

---

### Set Antenna Gain

Set the RF attenuation for a specific antenna path on a zone. 0 = maximum gain, 63 = maximum attenuation.

| Option       | Description              |
| ------------ | ------------------------ |
| Zone         | Antenna zone to control  |
| Antenna Path | A or B                   |
| Attenuation  | Attenuation level (0–63) |

---

## Feedbacks

All feedbacks are **value** type unless noted, meaning they return a value that can be used in Companion button text or expressions. LED state feedbacks are **boolean** type.

---

### Device ID

Returns a field from the device identifier.

| Option            | Returns                             |
| ----------------- | ----------------------------------- |
| Model             | Device model string (e.g. `MAT288`) |
| Option            | Option character                    |
| Class             | Device class number                 |
| Hardware Revision | Hardware revision number            |

---

### Firmware Version

Returns a field from the device firmware version.

| Option             | Returns                                                   |
| ------------------ | --------------------------------------------------------- |
| Type               | Version type: `DEBUG`, `RELEASE`, or `PRODUCTION_RELEASE` |
| Minor Version      | Minor firmware version number                             |
| Major Version      | Major firmware version number                             |
| µProcessor Version | Microprocessor firmware version number                    |

---

### Device LED State _(boolean)_

Returns the state of a front-panel LED. Useful for triggering a button style change when a fault is active.

| Option           | Returns                                      |
| ---------------- | -------------------------------------------- |
| Boot Failed      | `true` if boot has failed                    |
| Lock             | `true` if the front panel is locked          |
| Events           | `true` if there are pending events           |
| Errors           | `true` if there are pending errors           |
| Fan 1            | `true` if Fan 1 LED is active                |
| Fan 2            | `true` if Fan 2 LED is active                |
| Over Temperature | `true` if the over-temperature LED is active |
| AC               | `true` if the AC power LED is active         |
| DC               | `true` if the DC power LED is active         |
| Alarm            | `true` if the alarm LED is active            |

Default style: black text on red background when active.

---

### RF Level

Returns an RF signal level in dBm.

| Option | Returns                                                 |
| ------ | ------------------------------------------------------- |
| RF 1A  | Signal level on antenna 1, path A                       |
| RF 1B  | Signal level on antenna 1, path B — MAT288 only         |
| RF 2A  | Signal level on antenna 2, path A — 2×4:2 / 4:2 configs |
| RF 2B  | Signal level on antenna 2, path B — MAT288 2×4:2 config |

> **Note:** RF levels are updated according to the configured poll interval.

---

### Board Temperature

Returns a board temperature in degrees Celsius.

| Option     | Returns                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| Main Board | Temperature of the main board                                           |
| RX A       | Temperature of the RX A board                                           |
| RX B       | Temperature of the RX B board (MAT288 only — MAT244 always returns 1°C) |

> **Note:** Temperature and voltage are polled on a 30-second interval.

---

### Voltage Rail

Returns an internal voltage rail reading.

| Option           | Returns                 |
| ---------------- | ----------------------- |
| External DC      | External supply voltage |
| Main RF (+5v)    | Internal +5V rail       |
| Main Logic (+5v) | Internal +5V rail       |
| Main PWR (+12v)  | Internal +12V rail      |

> **Note:** Temperature and voltage are polled on a 30-second interval.

---

### Display Setting

Returns a current display parameter.

| Option     | Returns                   |
| ---------- | ------------------------- |
| Timeout    | Screen timeout in seconds |
| Brightness | Brightness level (0–255)  |

---

### Antenna Zone

Returns a value from a specific antenna zone. The **Field** dropdown determines which aspect of the zone is returned, and additional sub-options appear depending on the selected field.

| Field     | Sub-options          | Returns                                   |
| --------- | -------------------- | ----------------------------------------- |
| Name      | —                    | Zone name string                          |
| Active    | —                    | `true` or `false`                         |
| Diversity | —                    | `A`, `B`, or `AB`                         |
| Boost     | —                    | Boost mode name string (e.g. `AH`, `OFF`) |
| LEDs      | LED                  | See LED sub-options below                 |
| Antenna   | Antenna (A/B), Field | See antenna sub-options below             |

**LED sub-options (when Field = LEDs):**

| LED            | Returns                                                  |
| -------------- | -------------------------------------------------------- |
| Pending Events | `true` if there are pending events on this zone          |
| Pending Errors | `true` if there are pending errors on this zone          |
| Alarm Boost    | Alarm state string: `OFF`, `ERROR`, or `WARNING`         |
| Zone Colour    | Zone LED colour string: `OFF`, `RED`, `GREEN`, or `BLUE` |

**Antenna sub-options (when Field = Antenna):**

| Field         | Returns                                                                                 |
| ------------- | --------------------------------------------------------------------------------------- |
| Boost Voltage | Boost amplifier voltage in mV, or `null` if B path has no sensor (non-diversity MAT244) |
| Boost Current | Boost amplifier current in mA, or `null` if B path has no sensor                        |
| Gain          | Attenuation value (0–63)                                                                |

> **Note:** Antenna Boost Diagnostics are polled on a 30 second interval

---

### Antenna Zone Color _(Advanced)_

Set a button background color to match the specific antenna zone.

| Option | Description  |
| ------ | ------------ |
| Zone   | Antenna zone |
