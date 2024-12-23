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
import { MatBofEof, MatDst } from './enum.js'
import { MessageBus } from './messageBus.js'
import { MatApi } from './api.js'
import { MatDevice } from './device.js'
import { StatusManager } from './status.js'

/**
 * Class for control of Wisycom MAT 244 / 288 RF Matrix
 *
 */

export class WisycomMATInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig // Setup in init()
	socket!: TCPHelper
	#isRecordingActions: boolean = false
	#statusManager = new StatusManager(this, { status: InstanceStatus.Connecting, message: 'Initialising' }, 2000)
	public mat: MatDevice = new MatDevice()
	public api: MatApi = new MatApi(this.mat)
	private msgBus!: MessageBus
	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		await this.configUpdated(config)
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', `destroy ${this.id}:${this.label}`)
		this.msgBus.stopTimeout()
		if (this.socket) {
			await this.msgBus.sendMsg(this.api.close())
			this.socket.destroy()
		}
		this.#statusManager.destroy()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config

		this.#statusManager.updateStatus(InstanceStatus.Connecting)

		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updateVariableDefinitions() // export variable definitions
		await this.initTCP(config.host, config.port, config.password)
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

	/**
	 * Set action recorder state
	 *
	 */

	public handleStartStopRecordActions(isRecording: boolean): void {
		this.#isRecordingActions = isRecording
		console.log(this.#isRecordingActions)
	}

	/**
	 * Add message to queue and send
	 * @param msg Buffer to be sent
	 * @param priority Queue priority, defaults to 0
	 *
	 */

	public async sendMessage(msg: Buffer, priority?: number): Promise<void> {
		await this.msgBus.sendMsg(msg, priority)
	}

	/**
	 * Setup TCP Connection
	 * @param host Host to connect to
	 * @param port Port to connect on. Default: 2101
	 * @param password Password for MAT
	 *
	 */

	private async initTCP(host: string, port: number = 2101, password: string = ''): Promise<void> {
		let receiveBuffer: Buffer
		if (this.msgBus) {
			this.msgBus.stopTimeout()
			this.msgBus.clearQueue()
		}
		if (this.socket !== undefined && (this.socket.isConnected || this.socket.isConnecting)) {
			await this.msgBus.sendMsg(this.api.close())
			this.socket.destroy()
		}
		if (host !== undefined && host !== '') {
			this.log('info', `Connecting to MAT: ${host}:${port}`)

			this.#statusManager.updateStatus(InstanceStatus.Connecting, `Connecting to MAT: ${host}`)
			this.socket = new TCPHelper(host, port)
			this.msgBus = new MessageBus(500, this.socket)
			this.socket.on('status_change', (status, message) => {
				this.#statusManager.updateStatus(status, message)
			})
			this.socket.on('error', (err) => {
				this.log('error', `Network error:\n ${JSON.stringify(err)}`)
				//this.#statusManager.updateStatus(InstanceStatus.ConnectionFailure, err.message)
			})
			this.socket.on('connect', () => {
				this.log('info', `Connected to ${host}:${port}`)
				//this.#statusManager.updateStatus(InstanceStatus.Ok, 'Connection Established')
				this.msgBus.changeClearState(true)
				this.msgBus.sendMsg(this.api.open(password)).catch(() => {})
				this.msgBus.sendMsg(this.api.id()).catch(() => {})
				this.msgBus.sendMsg(this.api.name(MatDst.DEVICE)).catch(() => {})
				this.msgBus.sendMsg(this.api.appver()).catch(() => {})
				this.msgBus.sendMsg(this.api.serial()).catch(() => {})
			})
			this.socket.on('data', (chunk) => {
				this.log('debug', `Data recieved: ${chunk.toString()}`)
				let i = 0,
					line: Buffer,
					offset = 0
				receiveBuffer = Buffer.from([...receiveBuffer, ...chunk])
				while ((i = receiveBuffer.indexOf(MatBofEof.EOF, offset)) !== -1) {
					const start = receiveBuffer.indexOf(MatBofEof.BOF, offset)
					if (start !== -1) {
						line = receiveBuffer.subarray(start, i - offset)
						this.api.parseResponse(line)
						this.msgBus.changeClearState(true)
					}
					offset = i + 1
				}
				receiveBuffer = receiveBuffer.subarray(offset)
			})
		} else {
			this.#statusManager.updateStatus(InstanceStatus.BadConfig, 'No Host')
		}
	}
}

runEntrypoint(WisycomMATInstance, UpgradeScripts)
