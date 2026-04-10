import { type CompanionActionDefinitions } from '@companion-module/base'
import type WisycomMATInstance from './main.js'
import {
	MatDst,
	MatBooleanChoices,
	AntennaDiversityChoices,
	AntennaBoostChoices,
	type MatDstZones,
	ANTENNA_BOOST_CHOICES,
	ANTENNA_DIVERSITY_CHOICES,
	ANTENNA_GAIN_DIVERSITY_CHOICES,
} from './enum.js'
import { zoneChoices, isDiversityMode } from './zones.js'

export enum ActionId {
	SetName = 'set_name',
	SetDisplay = 'set_display',
	SetLock = 'set_lock',
	SetMessage = 'set_message',
	SetAntennaActivate = 'set_antenna_activate',
	SetAntennaDiversity = 'set_antenna_diversity',
	SetAntennaBoost = 'set_antenna_boost',
	SetAntennaGain = 'set_antenna_gain',
}

export type ActionSchema = {
	[ActionId.SetName]: {
		options: {
			dst: Exclude<MatDst, MatDst.PC> | MatDstZones
			name: string
		}
	}
	[ActionId.SetDisplay]: {
		options: {
			timeout: number
			brightness: number
		}
	}
	[ActionId.SetLock]: {
		options: {
			lock: boolean
		}
	}
	[ActionId.SetMessage]: {
		options: {
			blink: boolean
			message: string
		}
	}
	[ActionId.SetAntennaActivate]: {
		options: {
			zone: MatDstZones
			activation: boolean
		}
	}
	[ActionId.SetAntennaDiversity]: {
		options: {
			zone: MatDstZones
			diversity: AntennaDiversityChoices
		}
	}
	[ActionId.SetAntennaBoost]: {
		options: {
			zone: MatDstZones
			boost: AntennaBoostChoices
		}
	}
	[ActionId.SetAntennaGain]: {
		options: {
			zone: MatDstZones
			selection: AntennaDiversityChoices
			attenuation: number
		}
	}
}

export function UpdateActions(self: WisycomMATInstance): void {
	const zones = self.api ? zoneChoices(self.api) : []
	const zone0 = zones[0]?.id ?? 1
	const diversity = self.api ? isDiversityMode(self.api) : true
	const boostChoices = self.api
		? ANTENNA_BOOST_CHOICES.filter(
				(c: { id: AntennaBoostChoices; label: string }) =>
					diversity || [AntennaBoostChoices.OFF, AntennaBoostChoices.A_, AntennaBoostChoices.H_].includes(c.id),
			)
		: ANTENNA_BOOST_CHOICES

	// Destination choices for SetName — device itself plus each zone
	const nameDstChoices = [{ id: MatDst.DEVICE, label: 'Device' }, ...zones]

	const actions: CompanionActionDefinitions<ActionSchema> = {
		[ActionId.SetName]: {
			name: 'Set Name',
			description: 'Set the name of the device or a specific antenna zone (max 8 characters)',
			options: [
				{
					type: 'dropdown',
					id: 'dst',
					label: 'Destination',
					choices: nameDstChoices,
					default: MatDst.DEVICE,
				},
				{
					type: 'textinput',
					id: 'name',
					label: 'Name',
					default: '',
					useVariables: true,
				},
			],
			callback: async (action) => {
				if (!self.api) throw new Error('MAT API not initialised')
				await self.api.setName(action.options.dst, action.options.name.trim().substring(0, 8))
			},
		},

		[ActionId.SetDisplay]: {
			name: 'Set Display',
			description: 'Set the display timeout and brightness',
			options: [
				{
					type: 'number',
					id: 'timeout',
					label: 'Timeout (seconds)',
					default: 60,
					min: 0,
					max: 255,
				},
				{
					type: 'number',
					id: 'brightness',
					label: 'Brightness',
					default: 128,
					min: 0,
					max: 255,
				},
			],
			callback: async (action) => {
				if (!self.api) throw new Error('MAT API not initialised')
				await self.api.setDisplay({ timeout: action.options.timeout, brightness: action.options.brightness })
			},
		},

		[ActionId.SetLock]: {
			name: 'Set Lock',
			description: 'Lock or unlock the front panel',
			options: [
				{
					type: 'checkbox',
					id: 'lock',
					label: 'Locked',
					default: false,
				},
			],
			callback: async (action) => {
				if (!self.api) throw new Error('MAT API not initialised')
				await self.api.setLock({ lock: action.options.lock })
			},
		},

		[ActionId.SetMessage]: {
			name: 'Set Message',
			description: 'Display a message on the device screen, optionally with display blinking (max 40 characters)',
			options: [
				{
					type: 'checkbox',
					id: 'blink',
					label: 'Blink Display',
					default: false,
				},
				{
					type: 'textinput',
					id: 'message',
					label: 'Message',
					default: '',
					useVariables: true,
				},
			],
			callback: async (action) => {
				if (!self.api) throw new Error('MAT API not initialised')
				await self.api.setMessage({
					blink: action.options.blink,
					message: action.options.message.trim().substring(0, 40),
				})
			},
		},

		[ActionId.SetAntennaActivate]: {
			name: 'Set Antenna Zone Active',
			description: 'Enable or disable an antenna zone',
			options: [
				{
					type: 'dropdown',
					id: 'zone',
					label: 'Zone',
					choices: zones,
					default: zone0,
				},
				{
					type: 'checkbox',
					id: 'activation',
					label: 'Active',
					default: true,
				},
			],
			callback: async (action) => {
				if (!self.api) throw new Error('MAT API not initialised')
				await self.api.setAntennaActivate(action.options.zone, {
					activation: action.options.activation ? MatBooleanChoices.TRUE : MatBooleanChoices.FALSE,
				})
			},
		},

		[ActionId.SetAntennaDiversity]: {
			name: 'Set Antenna Diversity',
			description: 'Set the RF diversity mode for an antenna zone',
			options: [
				{
					type: 'dropdown',
					id: 'zone',
					label: 'Zone',
					choices: zones,
					default: zone0,
				},
				{
					type: 'dropdown',
					id: 'diversity',
					label: 'Diversity',
					choices: ANTENNA_DIVERSITY_CHOICES,
					default: AntennaDiversityChoices.AB,
				},
			],
			callback: async (action) => {
				if (!self.api) throw new Error('MAT API not initialised')
				await self.api.setAntennaDiversity(action.options.zone, { diversity: action.options.diversity })
			},
		},

		[ActionId.SetAntennaBoost]: {
			name: 'Set Antenna Boost',
			description: 'Set the boost amplifier mode for an antenna zone',
			options: [
				{
					type: 'dropdown',
					id: 'zone',
					label: 'Zone',
					choices: zones,
					default: zone0,
				},
				{
					type: 'dropdown',
					id: 'boost',
					label: 'Boost',
					choices: boostChoices,
					default: AntennaBoostChoices.OFF,
				},
			],
			callback: async (action) => {
				if (!self.api) throw new Error('MAT API not initialised')
				await self.api.setAntennaBoost(action.options.zone, { boost: action.options.boost })
			},
		},

		[ActionId.SetAntennaGain]: {
			name: 'Set Antenna Gain',
			description:
				'Set the RF gain (attenuation) for a specific antenna path on a zone (0 = max gain, 63 = max attenuation)',
			options: [
				{
					type: 'dropdown',
					id: 'zone',
					label: 'Zone',
					choices: zones,
					default: zone0,
				},
				{
					type: 'dropdown',
					id: 'selection',
					label: 'Antenna Path',
					choices: ANTENNA_GAIN_DIVERSITY_CHOICES,
					default: AntennaDiversityChoices.A,
				},
				{
					type: 'number',
					id: 'attenuation',
					label: 'Attenuation (0–63)',
					default: 0,
					min: 0,
					max: 63,
				},
			],
			callback: async (action) => {
				if (!self.api) throw new Error('MAT API not initialised')
				await self.api.setAntennaGain(action.options.zone, {
					selection: action.options.selection,
					attenuation: action.options.attenuation,
				})
			},
		},
	}

	self.setActionDefinitions(actions)
}
