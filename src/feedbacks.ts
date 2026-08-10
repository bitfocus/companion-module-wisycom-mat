import { type CompanionFeedbackDefinitions, combineRgb } from '@companion-module/base'
import type WisycomMATInstance from './main.js'
import {
	type MatDstZones,
	AntennaDiversityChoices,
	AntennaBoostChoices,
	AntennaZoneColors,
	AntennaAlarmLed,
	MatVersionType,
} from './enum.js'
import {
	type MatEvents,
	type MatIdKeys,
	type MatVersionsKeys,
	type MatLedsKeys,
	type MatRfLevelsKeys,
	type MatTempsKeys,
	type MatVoltagesKeys,
	type MatDisplayKeys,
	type AntennaLedsKeys,
	type AntennaDetailsKeys,
	type AntennaZoneKeys,
	MAT_ID_CHOICES,
	MAT_VERSIONS_CHOICES,
	MAT_LEDS_CHOICES,
	MAT_RF_LEVELS_CHOICES,
	MAT_TEMPS_CHOICES,
	MAT_VOLTAGES_CHOICES,
	MAT_DISPLAY_CHOICES,
	ANTENNA_LEDS_CHOICES,
	ANTENNA_DETAILS_CHOICES,
	ANTENNA_ZONE_CHOICES,
} from './api.js'

import { zoneChoices } from './zones.js'

const colors = {
	blue: combineRgb(0, 128, 208),
	green: combineRgb(0, 123, 0),
	red: combineRgb(255, 0, 0),
	off: combineRgb(47, 47, 47),
} as const

const styles = {
	blackOnRed: {
		bgcolor: combineRgb(255, 0, 0),
		color: combineRgb(0, 0, 0),
	},
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sub(event: keyof MatEvents, feedbackId: string, self: WisycomMATInstance): void {
	self.addFeedbackSubscription(event, feedbackId)
}

function unsub(event: keyof MatEvents, feedbackId: string, self: WisycomMATInstance): void {
	self.removeFeedbackSubscription(event, feedbackId)
}

// ── Feedback IDs ──────────────────────────────────────────────────────────────

export enum FeedbackId {
	Id = 'id',
	Versions = 'versions',
	Leds = 'leds',
	RfLevels = 'rfLevels',
	Temp = 'temp',
	Voltage = 'voltage',
	Display = 'display',
	AntennaZone = 'antennaZone',
	AntennaButtonColor = 'antennaButtonColor',
}

// ── Feedback schema ───────────────────────────────────────────────────────────

export type FeedbackSchema = {
	[FeedbackId.Id]: {
		type: 'value'
		options: { field: MatIdKeys }
	}
	[FeedbackId.Versions]: {
		type: 'value'
		options: { field: MatVersionsKeys }
	}
	[FeedbackId.Leds]: {
		type: 'boolean'
		options: { field: MatLedsKeys }
	}
	[FeedbackId.RfLevels]: {
		type: 'value'
		options: { field: MatRfLevelsKeys }
	}
	[FeedbackId.Temp]: {
		type: 'value'
		options: { field: MatTempsKeys }
	}
	[FeedbackId.Voltage]: {
		type: 'value'
		options: { field: MatVoltagesKeys }
	}
	[FeedbackId.Display]: {
		type: 'value'
		options: { field: MatDisplayKeys }
	}
	[FeedbackId.AntennaZone]: {
		type: 'value'
		options: {
			zone: MatDstZones
			antenna: 'A' | 'B'
			field: AntennaZoneKeys
			leds: AntennaLedsKeys
			details: AntennaDetailsKeys
		}
	}
	[FeedbackId.AntennaButtonColor]: {
		type: 'advanced'
		options: {
			zone: MatDstZones
		}
	}
}

// ── Definition builder ────────────────────────────────────────────────────────

export function UpdateFeedbacks(self: WisycomMATInstance): void {
	const zones = self.api ? zoneChoices(self.api) : []
	const zone0 = zones[0]?.id ?? 1

	const feedbacks = {} as CompanionFeedbackDefinitions<FeedbackSchema>

	feedbacks[FeedbackId.Id] = {
		name: 'Device ID',
		description: 'Returns a field from the device identifier (model, class, hardware revision)',
		type: 'value',
		options: [
			{ type: 'dropdown', id: 'field', label: 'Field', choices: MAT_ID_CHOICES, default: MAT_ID_CHOICES[0].id },
		],
		callback: (feedback) => {
			sub('id', feedback.id, self)
			return self.api?.id[feedback.options.field] ?? null
		},
		unsubscribe: (feedback) => unsub('id', feedback.id, self),
	}

	feedbacks[FeedbackId.Versions] = {
		name: 'Firmware Version',
		description: 'Returns a field from the device firmware version',
		type: 'value',
		options: [
			{
				type: 'dropdown',
				id: 'field',
				label: 'Field',
				choices: MAT_VERSIONS_CHOICES,
				default: MAT_VERSIONS_CHOICES[0].id,
			},
		],
		callback: (feedback) => {
			sub('versions', feedback.id, self)
			if (!self.api) return null
			switch (feedback.options.field) {
				case 'major':
					return self.api.versions.major
				case 'minor':
					return self.api.versions.minor
				case 'muProcessor':
					return self.api.versions.muProcessor
				case 'type':
					return MatVersionType[self.api.versions.type]
				default: {
					const _exhaustiveCheck: never = feedback.options.field
					return _exhaustiveCheck
				}
			}
		},
		unsubscribe: (feedback) => unsub('versions', feedback.id, self),
	}

	feedbacks[FeedbackId.Leds] = {
		name: 'Device LED State',
		description: 'Returns the state of a front-panel LED (boot failed, lock, fans, AC, DC, alarm, etc.)',
		type: 'boolean',
		defaultStyle: styles.blackOnRed,
		options: [
			{ type: 'dropdown', id: 'field', label: 'LED', choices: MAT_LEDS_CHOICES, default: MAT_LEDS_CHOICES[0].id },
		],
		callback: (feedback) => {
			sub('leds', feedback.id, self)
			return self.api?.leds[feedback.options.field] ?? false
		},
		unsubscribe: (feedback) => unsub('leds', feedback.id, self),
	}

	feedbacks[FeedbackId.RfLevels] = {
		name: 'RF Level',
		description: 'Returns an RF signal level in dBm',
		type: 'value',
		options: [
			{
				type: 'dropdown',
				id: 'field',
				label: 'Path',
				choices: MAT_RF_LEVELS_CHOICES,
				default: MAT_RF_LEVELS_CHOICES[0].id,
			},
		],
		callback: (feedback) => {
			sub('rfLevels', feedback.id, self)
			const rf = self.api?.rfLevels[feedback.options.field] ?? null
			return rf === null ? rf : rf / 100
		},
		unsubscribe: (feedback) => unsub('rfLevels', feedback.id, self),
	}

	feedbacks[FeedbackId.Temp] = {
		name: 'Board Temperature',
		description: 'Returns a board temperature in °C',
		type: 'value',
		options: [
			{ type: 'dropdown', id: 'field', label: 'Board', choices: MAT_TEMPS_CHOICES, default: MAT_TEMPS_CHOICES[0].id },
		],
		callback: (feedback) => {
			sub('temp', feedback.id, self)
			return self.api?.temp[feedback.options.field] ?? null
		},
		unsubscribe: (feedback) => unsub('temp', feedback.id, self),
	}

	feedbacks[FeedbackId.Voltage] = {
		name: 'Voltage Rail',
		description: 'Returns a voltage rail reading in V',
		type: 'value',
		options: [
			{
				type: 'dropdown',
				id: 'field',
				label: 'Rail',
				choices: MAT_VOLTAGES_CHOICES,
				default: MAT_VOLTAGES_CHOICES[0].id,
			},
		],
		callback: (feedback) => {
			sub('voltage', feedback.id, self)
			const volts = self.api?.voltage[feedback.options.field] ?? null
			return volts === null ? volts : volts / 1000
		},
		unsubscribe: (feedback) => unsub('voltage', feedback.id, self),
	}

	feedbacks[FeedbackId.Display] = {
		name: 'Display Setting',
		description: 'Returns a display parameter (timeout or brightness)',
		type: 'value',
		options: [
			{
				type: 'dropdown',
				id: 'field',
				label: 'Setting',
				choices: MAT_DISPLAY_CHOICES,
				default: MAT_DISPLAY_CHOICES[0].id,
			},
		],
		callback: (feedback) => {
			sub('display', feedback.id, self)
			return self.api?.display[feedback.options.field] ?? null
		},
		unsubscribe: (feedback) => unsub('display', feedback.id, self),
	}

	feedbacks[FeedbackId.AntennaZone] = {
		name: 'Antenna Zone',
		description: 'Returns a field from an antenna zone (name, active, diversity, boost)',
		type: 'value',
		options: [
			{ type: 'dropdown', id: 'zone', label: 'Zone', choices: zones, default: zone0 },
			{
				type: 'dropdown',
				id: 'field',
				label: 'Field',
				choices: ANTENNA_ZONE_CHOICES,
				default: ANTENNA_ZONE_CHOICES[0].id,
				disableAutoExpression: true,
			},
			{
				type: 'dropdown',
				id: 'leds',
				label: 'LED',
				choices: ANTENNA_LEDS_CHOICES,
				default: ANTENNA_LEDS_CHOICES[0].id,
				isVisibleExpression: `$(options:field) == '${ANTENNA_ZONE_CHOICES[1].id}'`,
			},
			{
				type: 'dropdown',
				id: 'antenna',
				label: 'Antenna',
				choices: [
					{ id: 'A', label: 'A' },
					{ id: 'B', label: 'B' },
				],
				default: 'A',
				isVisibleExpression: `$(options:field) == '${ANTENNA_ZONE_CHOICES[5].id}'`,
			},
			{
				type: 'dropdown',
				id: 'details',
				label: 'Field',
				choices: ANTENNA_DETAILS_CHOICES,
				default: ANTENNA_DETAILS_CHOICES[0].id,
				isVisibleExpression: `$(options:field) == '${ANTENNA_ZONE_CHOICES[5].id}'`,
			},
		],
		callback: (feedback) => {
			sub('zone', feedback.id, self)
			const zone = self.api?.zone(feedback.options.zone)
			if (!zone) return null
			switch (feedback.options.field) {
				case 'active':
					return zone.active
				case 'antenna':
					if (feedback.options.details == 'voltage') {
						const voltage = zone.antenna[feedback.options.antenna]['voltage'] ?? 0
						return voltage / 1000
					}
					return zone.antenna[feedback.options.antenna][feedback.options.details]
				case 'boost':
					return AntennaBoostChoices[zone.boost]
				case 'diversity':
					return AntennaDiversityChoices[zone.diversity]
				case 'leds':
					switch (feedback.options.leds) {
						case 'alarmBoost':
							return AntennaAlarmLed[zone.leds.alarmBoost]
						case 'pendingErrors':
							return zone.leds.pendingErrors
						case 'pendingEvents':
							return zone.leds.pendingEvents
						case 'zone':
							return AntennaZoneColors[zone.leds.zone]
						default: {
							const _exhaustiveCheck: never = feedback.options.leds
							return _exhaustiveCheck
						}
					}
				case 'name':
					return zone.name
				default: {
					const _exhaustiveCheck: never = feedback.options.field
					return _exhaustiveCheck
				}
			}
		},
		unsubscribe: (feedback) => unsub('zone', feedback.id, self),
	}

	feedbacks[FeedbackId.AntennaButtonColor] = {
		name: 'Antenna Zone Color',
		description: 'Set button to match the antenna zone color',
		type: 'advanced',
		options: [{ type: 'dropdown', id: 'zone', label: 'Zone', choices: zones, default: zone0 }],
		affectedProperties: ['bgcolor'],
		callback: (feedback) => {
			sub('zone', feedback.id, self)
			const zone = self.api?.zone(feedback.options.zone)
			if (!zone) return {}
			switch (AntennaZoneColors[zone.leds.zone]) {
				case 'OFF':
					return { bgcolor: colors.off }
				case 'RED':
					return { bgcolor: colors.red }
				case 'GREEN':
					return { bgcolor: colors.green }
				case 'BLUE':
					return { bgcolor: colors.blue }
				default:
					throw new Error('Invalid Zone Color')
			}
		},
		unsubscribe: (feedback) => unsub('zone', feedback.id, self),
	}

	self.setFeedbackDefinitions(feedbacks)
}
