import type { TCPHelper } from '@companion-module/base'
import delay from 'delay'
import PQueue from 'p-queue'

/**
 * Setup outbound message bus
 * @param timeout Duration in ms to wait after sending message before giving up waiting for a response
 * @param socket TCPhelper from which to send messages in the queue
 *
 */

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

	/**
	 * Stop & delete the msgTimer. Does not reset this.#clearToTx
	 *
	 */

	public stopTimeout(): void {
		if (this.msgTimer) {
			clearTimeout(this.msgTimer)
			delete this.msgTimer
		}
	}

	/**
	 * Start message timeout timer, set this.#clearToTx to false
	 *
	 */

	private startTimeout(): void {
		this.stopTimeout()
		this.#clearToTx = false
		this.msgTimer = setTimeout(() => (this.#clearToTx = true), this.#timeout)
	}

	/**
	 * @returns True if queue is OK to send next message
	 *
	 */

	public get isClearToTx(): boolean {
		return this.#clearToTx
	}

	/**
	 * Set & return the value of this.#clearToTx
	 *
	 */

	public changeClearState(state: boolean): boolean {
		return (this.#clearToTx = state)
	}

	/**
	 * Add message to outbound queue
	 * @param msg Message buffer to be queued
	 * @param priority Queue Priority to use, default = 0
	 *
	 */

	public async sendMsg(msg: Buffer, priority = 0): Promise<void> {
		await this.#queue.add(
			async () => {
				while (!this.isClearToTx) {
					await delay(20)
				}
				if (this.#socket.isConnected) {
					await this.#socket.send(msg)
					this.startTimeout()
				}
			},
			{ priority: priority },
		)
	}

	/**
	 * Clear outbound message queue
	 *
	 */

	public clearQueue(): void {
		this.#queue.clear()
	}

	/**
	 * @returns Size of outbound message queue
	 *
	 */

	get queueSize(): number {
		return this.#queue.size
	}

	/**
	 * @param prio Priority number of interest
	 * @returns Size of outbound message queue matching priority number
	 *
	 */

	queuePrioritySize(prio: number): number {
		return this.#queue.sizeBy({ priority: Math.round(prio) })
	}
}
