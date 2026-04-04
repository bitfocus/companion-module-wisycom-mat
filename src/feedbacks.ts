// import { combineRgb, createModuleLogger, type CompanionFeedbackDefinitions } from '@companion-module/base'
import type WisycomMATInstance from './main.js'
// import { MatDst, MatDstZones } from './enum.js'

/* const styles = {
	blackOnRed: {
		bgcolor: combineRgb(255, 0, 0),
		color: combineRgb(0, 0, 0),
	},
} */

export enum FeedbackId {
	ZoneActive = 'zoneActive',
}

export type FeedbackSchema = {
	[FeedbackId.ZoneActive]: {
		type: 'boolean'
		options: {
			zone: never
		}
	}
}
export function UpdateFeedbacks(_self: WisycomMATInstance): void {
	/* 	const logger = createModuleLogger('Feedbacks')
	const zones: { id: MatDst; label: string }[] = []
	for (let i = 1; i <= 8; i++) {
		zones.push({ id: i, label: `${i}: ${self.mat.getZone(i).name.trim()}` })
	}

	const feedbacks: CompanionFeedbackDefinitions<FeedbackSchema> = {
		[FeedbackId.ZoneActive]: {
			name: 'Antenna Zone Active',
			type: 'boolean',
			defaultStyle: styles.blackOnRed,
			options: [
				{
					type: 'dropdown',
					label: 'Zone',
					id: 'zone',
					choices: zones,
					default: zones[0].id,
					allowCustom: false,
				},
			],
			callback: (feedback) => {
				return false //self.mat.getZone(feedback.options.zone as MatDstZones).active
			},
/* 			subscribe: async (feedback) => {
				await self.sendMessage(self.api.antennaActivate(feedback.options.zone as MatDstZones))
			},
		},
	}
	self.setFeedbackDefinitions(feedbacks) */
}
