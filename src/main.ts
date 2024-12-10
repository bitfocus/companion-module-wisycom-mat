import {
	InstanceBase,
	runEntrypoint,
	InstanceStatus,
	SomeCompanionConfigField,
	TCPHelper,
} from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { MatBofEof } from './enum.js'
import { parseResponse } from './utils.js'
import { MessageBus } from './messageBus.js'
import { MatApi } from './api.js'

export class WisyComMATInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig // Setup in init()
	socket!: TCPHelper
	public api: MatApi = new MatApi()
	private msgBus!: MessageBus
	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		await this.configUpdated(config)
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', `destroy ${this.label}`)
		this.msgBus.stopTimeout()
		if (this.socket) {
			await this.msgBus.sendMsg(this.api.close())
			this.socket.destroy()
		}
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config

		this.updateStatus(InstanceStatus.Connecting)

		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updateVariableDefinitions() // export variable definitions
		this.initTCP(config.host, config.port).catch(() => {})
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

	async initTCP(host: string, port: number = 2101): Promise<void> {
		let receiveBuffer: Buffer
		if (this.msgBus) {
			this.msgBus.stopTimeout()
			this.msgBus.clearQueue()
		}
		if (this.socket.isConnected || this.socket.isConnecting) {
			await this.msgBus.sendMsg(this.api.close())
			this.socket.destroy()
		}
		if (this.config.host) {
			this.log('debug', `Connecting to MAT: ${host}:${port}`)

			this.updateStatus(InstanceStatus.Connecting, `Connecting to MAT: ${host}`)
			this.socket = new TCPHelper(host, port)
			this.msgBus = new MessageBus(500, this.socket)
			this.socket.on('status_change', (status, message) => {
				this.updateStatus(status, message)
			})
			this.socket.on('error', (err) => {
				this.log('error', `Network error:\n ${JSON.stringify(err)}`)
				//this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
			})
			this.socket.on('connect', () => {
				this.log('info', `Connected to ${host}:${port}`)
				//this.updateStatus(InstanceStatus.Ok, 'Connection Established')
				this.msgBus.changeClearState(true)
				this.msgBus.sendMsg(this.api.open(this.config.password)).catch(() => {})
			})
			this.socket.on('data', (chunk) => {
				let i = 0,
					line: Buffer,
					offset = 0
				receiveBuffer = Buffer.from([...receiveBuffer, ...chunk])
				while ((i = receiveBuffer.indexOf(MatBofEof.EOF, offset)) !== -1) {
					const start = receiveBuffer.indexOf(MatBofEof.BOF, offset)
					if (start !== -1) {
						line = receiveBuffer.subarray(start, i - offset)
						parseResponse(line, this)
						this.msgBus.changeClearState(true)
					}
					offset = i + 1
				}
				receiveBuffer = receiveBuffer.subarray(offset)
			})
		} else {
			this.updateStatus(InstanceStatus.BadConfig, 'No Host')
		}
	}
}

runEntrypoint(WisyComMATInstance, UpgradeScripts)
