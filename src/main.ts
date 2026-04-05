import { InstanceBase, InstanceStatus, SomeCompanionConfigField, createModuleLogger } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig, type ModuleSecrets } from './config.js'
import { UpdateVariableDefinitions } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { MatApi, type MatEvents, type MatEventSubscriptions } from './api.js'
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
	public api: MatApi | null = null
	private feedbackIdsToCheck: Set<string> = new Set()
	private feedbackSubscriptions: MatEventSubscriptions = new Map()
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
		await this.closeApi()
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecrets): Promise<void> {
		this.config = config
		this.secrets = secrets
		this.#statusManager.updateStatus(InstanceStatus.Connecting)
		await this.closeApi()
		this.api = new MatApi(config.host, config.port, secrets.password)
		this.setupApiEventListeners()
		this.api.connect()
		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updateVariableDefinitions() // export variable definitions
	}

	private async closeApi(): Promise<void> {
		if (this.api) {
			// Attempt a polite closing
			if (this.api.isOpen) await this.api.close()
			this.api.disconnect()
			this.api.removeAllListeners()
			this.api = null
		}
	}

	private setupApiEventListeners(): void {
		if (!this.api) return
		const onEvent = (event: keyof MatEvents): void => {
			const ids = this.feedbackSubscriptions.get(event)
			if (ids) {
				for (const id of ids) {
					this.feedbackIdsToCheck.add(id)
				}
			}
			this.throttledFeedbackIdCheck()
		}

		for (const event of Object.keys(this.api) as (keyof MatEvents)[]) {
			this.api.on(event, () => onEvent(event))
		}
	}

	private throttledFeedbackIdCheck = throttle(
		() => {
			this.checkFeedbacksById(...this.feedbackIdsToCheck)
			this.feedbackIdsToCheck.clear()
		},
		60,
		{ edges: ['trailing'] },
	)

	public addFeedbackSubscription(event: keyof MatEvents, feedbackId: string): void {
		const eventSubs = this.feedbackSubscriptions.get(event) ?? new Set<string>()
		eventSubs.add(feedbackId)
		this.feedbackSubscriptions.set(event, eventSubs)
	}

	public removeFeedbackSubscription(event: keyof MatEvents, feedbackId: string): void {
		const eventSubs = this.feedbackSubscriptions.get(event)
		if (!eventSubs) return
		eventSubs.delete(feedbackId)
	}

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
