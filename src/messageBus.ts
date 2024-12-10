import type { TCPHelper } from '@companion-module/base'
import delay from 'delay'
import PQueue from 'p-queue'

export class MessageBus {
	#clearToTx: boolean = true
	private msgTimer: NodeJS.Timeout | undefined = undefined
	#timeout!: number
	#socket!: TCPHelper
	#queue: PQueue = new PQueue({ concurrency: 1, interval: 20, intervalCap: 1 })
	constructor(timeout: number, socket: TCPHelper) {
		this.#clearToTx = true
		this.#socket = socket
		this.#timeout = Math.round(timeout)
	}

	public stopTimeout(): void {
		if (this.msgTimer) {
			clearTimeout(this.msgTimer)
			delete this.msgTimer
		}
	}
	public startTimeout(): void {
		this.stopTimeout()
		this.#clearToTx = false
		this.msgTimer = setTimeout(() => (this.#clearToTx = true), this.#timeout)
	}

	public get isClearToTx(): boolean {
		return this.#clearToTx
	}

	public changeClearState(state: boolean): boolean {
		return (this.#clearToTx = state)
	}
	public async sendMsg(msg: Buffer, prio = 0): Promise<void> {
		await this.#queue.add(
			async () => {
				while (!this.#clearToTx) {
					await delay(20)
				}
				if (this.#socket.isConnected) {
					await this.#socket.send(msg)
					this.startTimeout()
				}
			},
			{ priority: prio },
		)
	}

	public clearQueue(): void {
		this.#queue.clear()
	}

	get queueSize(): number {
		return this.#queue.size
	}

	queuePrioritySize(prio: number): number {
		return this.#queue.sizeBy({ priority: Math.round(prio) })
	}
}
