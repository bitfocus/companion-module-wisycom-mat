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
import delay from 'delay'
import PQueue from 'p-queue'
import { matBofEof, matMessage } from './enum.js'
import { parseResponse } from './utils.js'

export class WisyComMATInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig // Setup in init()
	queue: PQueue = new PQueue({ concurrency: 1, interval: 20, intervalCap: 1 })
	socket!: TCPHelper
	private messageToken: number = 0
	private clearToTx: boolean = true
	private msgTimer: NodeJS.Timeout | undefined
	public messages: Map<number, matMessage> = new Map<number, matMessage>()
	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		await this.configUpdated(config)
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', `destroy ${this.label}`)
		this.stopMsgTimeOut()
		if (this.socket) {
			this.socket.destroy()
		}
	}

	public get token(): number {
		const token = this.messageToken
		this.messageToken = this.messageToken >= 254 ? 0 : this.messageToken + 1
		return token
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config

		this.updateStatus(InstanceStatus.Connecting)

		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updateVariableDefinitions() // export variable definitions
		this.initTCP(config.host, config.port)
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
	stopMsgTimeOut(): void {
		if (this.msgTimer) {
			clearTimeout(this.msgTimer)
			delete this.msgTimer
		}
	}
	startMsgTimeOut(timeout: number): void {
		this.stopMsgTimeOut()
		this.clearToTx = false
		this.msgTimer = setTimeout(() => (this.clearToTx = true), timeout)
	}

	sendMsg(msg: Buffer): void {
		this.queue
			.add(async () => {
				while (!this.clearToTx) {
					await delay(20)
				}
				await this.socket.send(msg)
				this.startMsgTimeOut(500)
			})
			.catch(() => {})
	}

	initTCP(host: string, port: number = 2101): void {
		let receiveBuffer: Buffer
		this.stopMsgTimeOut()
		this.queue.clear()
		if (this.socket.isConnected || this.socket.isConnecting) {
			this.socket.destroy()
		}
		if (this.config.host) {
			this.log('debug', 'Creating New Socket')

			this.updateStatus(InstanceStatus.Connecting, `Connecting to MAT: ${host}`)
			this.socket = new TCPHelper(host, port)

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
				this.clearToTx = true
			})
			this.socket.on('data', (chunk) => {
				let i = 0,
					line: Buffer,
					offset = 0
				receiveBuffer = Buffer.from([...receiveBuffer, ...chunk])
				while ((i = receiveBuffer.indexOf(matBofEof.EOF, offset)) !== -1) {
					const start = receiveBuffer.indexOf(matBofEof.BOF, offset)
					line = receiveBuffer.subarray(start, i - offset)
					offset = i + 1
					parseResponse(line, this)
					this.clearToTx = true
				}
				receiveBuffer = receiveBuffer.subarray(offset)
			})
		} else {
			this.updateStatus(InstanceStatus.BadConfig, 'No Host')
		}
	}
}

runEntrypoint(WisyComMATInstance, UpgradeScripts)
