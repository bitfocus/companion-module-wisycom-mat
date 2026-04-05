import { InstanceBase, InstanceStatus, SomeCompanionConfigField, createModuleLogger } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig, type ModuleSecrets } from './config.js'
import { UpdateVariableDefinitions } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { MatApi, type MatEvents, MAT_EVENT_NAMES, type MatEventSubscriptions } from './api.js'
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
	private feedbackSubscriptions: MatEventSubscriptions = new Map(
		MAT_EVENT_NAMES.map((event) => [event, new Set<string>()]),
	)
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
		this.throttledUpdateCompanionBits()
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
		if (!this.api) throw new Error('MAT API not initalized, can not setup API event listeners') // Should never happen

		for (const event of MAT_EVENT_NAMES) {
			this.api.on(event, () => {
				switch (event) {
					case 'open':
						this.#statusManager.updateStatus(InstanceStatus.Ok)
						this.#onApiOpen().catch(() => {})
						break
					case 'close':
						this.#statusManager.updateStatus(InstanceStatus.Disconnected)
						break
				}
				const ids = this.feedbackSubscriptions.get(event)
				if (ids) {
					for (const id of ids) {
						this.feedbackIdsToCheck.add(id)
					}
				}
				this.throttledFeedbackIdCheck()
				if (event == 'zone') this.throttledUpdateCompanionBits() // In case Zone names have changed, make sure the dropdowns follow
			})
		}
	}

	async #onApiOpen(): Promise<void> {
		if (!this.api) return
		try {
			// Query static device identity first — these don't change
			await this.api.queryId()
			await this.api.querySerial()
			await this.api.queryAppver()
			// Query current configuration and state
			await this.api.setAntennaMatrix()
			await this.api.queryStatus()
			// Query names for all zones
			/* for (const zone of MAT_EVENT_NAMES) {
				// replace with zoneChoices or zone list
			} */
			// Start automatic status updates — state kept fresh without polling
			await this.api.setAutostatus(true)
		} catch (err) {
			this.logger.error(`Initial query failed: ${(err as Error).message}`)
			this.#statusManager.updateStatus(InstanceStatus.ConnectionFailure)
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
		this.feedbackSubscriptions.get(event)!.add(feedbackId)
	}

	public removeFeedbackSubscription(event: keyof MatEvents, feedbackId: string): void {
		this.feedbackSubscriptions.get(event)!.delete(feedbackId)
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

	private throttledUpdateCompanionBits = throttle(
		() => {
			this.updateActions()
			this.updateFeedbacks()
			this.updateVariableDefinitions()
		},
		1000,
		{ edges: ['trailing'] },
	)
}
