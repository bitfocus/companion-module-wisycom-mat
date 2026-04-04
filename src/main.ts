import { InstanceBase, InstanceStatus, SomeCompanionConfigField, createModuleLogger } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig, type ModuleSecrets } from './config.js'
import { UpdateVariableDefinitions } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { MatApi } from './api.js'
import { StatusManager } from './status.js'
import type { InstanceBaseExt, MatTypes } from './types.js'
import { throttle } from 'es-toolkit'

/**
 * Class for control of Wisycom MAT 244 / 288 RF Matrix
 *
 */

export { UpgradeScripts }

export default class WisycomMATInstance extends InstanceBase<MatTypes> implements InstanceBaseExt {
	config!: ModuleConfig // Setup in init()
	secrets!: ModuleSecrets
	#statusManager = new StatusManager(this, { status: InstanceStatus.Connecting, message: 'Initialising' }, 2000)
	public api!: MatApi
	private feedbackIdsToCheck: Set<string> = new Set()
	private logger = createModuleLogger('Base Class')
	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecrets): Promise<void> {
		await this.configUpdated(config, secrets)
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.logger.debug(`destroy ${this.id}:${this.label}`)
		this.#statusManager.destroy()
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecrets): Promise<void> {
		this.config = config
		this.secrets = secrets
		this.#statusManager.updateStatus(InstanceStatus.Connecting)

		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updateVariableDefinitions() // export variable definitions
		this.api = new MatApi(config.host, config.port, secrets.password)
		this.api.connect()
	}

	private throttledFeedbackIdCheck = throttle(
		() => {
			this.checkFeedbacksById(...this.feedbackIdsToCheck)
			this.feedbackIdsToCheck.clear()
		},
		30,
		{ edges: ['trailing'] },
	)

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}
}
