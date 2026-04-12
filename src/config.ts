import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	host: string
	port: number
	interval: number
}

export type ModuleSecrets = {
	password: string
}

export enum MatModels {
	Mat244 = 'MAT244',
	Mat288 = 'MAT288',
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'MAT IP',
			width: 8,
			regex: Regex.IP,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			width: 4,
			min: 1,
			max: 65535,
			default: 2101,
		},
		{
			type: 'number',
			id: 'interval',
			label: 'Poll Interval (ms)',
			width: 4,
			min: 20,
			max: 5000,
			default: 32,
		},
		{
			type: 'secret-text',
			id: 'password',
			label: 'Password',
			width: 4,
			default: '',
			regex: '/^.{0,8}$/',
		},
	]
}
