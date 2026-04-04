import { createModuleLogger, type CompanionActionDefinitions } from '@companion-module/base'
import type WisycomMATInstance from './main.js'

export enum ActionId {
	SampleAction = 'sample_action',
}

export type ActionSchema = {
	[ActionId.SampleAction]: {
		options: {
			num: number
		}
	}
}

export function UpdateActions(self: WisycomMATInstance): void {
	const logger = createModuleLogger('Actions')
	const actions: CompanionActionDefinitions<ActionSchema> = {
		[ActionId.SampleAction]: {
			name: 'My First Action',
			options: [{ id: 'num', type: 'number', label: 'Test', default: 5, min: 0, max: 100 }],
			callback: async (_event) => {
				logger.debug('Hello world!')
			},
		},
	}
	self.setActionDefinitions(actions)
}
