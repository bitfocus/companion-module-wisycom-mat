import type { InstanceBase, JsonValue } from '@companion-module/base'
import type { ModuleConfig, ModuleSecrets } from './config.js'
import type { ActionSchema } from './actions.js'
import type { FeedbackSchema } from './feedbacks.js'

export interface MatTypes {
	config: ModuleConfig
	secrets: ModuleSecrets
	actions: ActionSchema
	feedbacks: FeedbackSchema
	variables: Record<string, JsonValue>
}

export interface InstanceBaseExt extends InstanceBase<MatTypes> {
	config: ModuleConfig
}
