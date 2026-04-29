import { EventEmitter } from 'node:events'
import { createModuleLogger, TCPHelper } from '@companion-module/base'
import PQueue from 'p-queue'
import {
	MatCmd,
	MatBofEof,
	MatSrc,
	MatDst,
	MatDstZones,
	MatMsgType,
	isMatVersionType,
	MatMsgStatus,
	MatVersionType,
	SubCmdAntenna,
	AntennaMatrixChoices,
	MatBooleanChoices,
	AntennaDiversityChoices,
	AntennaBoostChoices,
	AntennaAlarmLed,
	AntennaZoneColors,
} from './enum.js'
import { IS_DIVERSITY, normaliseModel } from './zones.js'

// ── Device state interfaces (exported for use by the module) ──────────────────

export interface MatId {
	model: string
	option: string
	class: number
	hwRev: number
}

export type MatIdKeys = keyof MatId

export interface MatVersions {
	type: MatVersionType
	minor: number
	major: number
	muProcessor: number
}

export type MatVersionsKeys = keyof MatVersions

export interface MatLeds {
	bootFailed: boolean
	lock: boolean
	events: boolean
	errors: boolean
	fan1: boolean
	fan2: boolean
	overTemp: boolean
	ac: boolean
	dc: boolean
	alarm: boolean
}

export type MatLedsKeys = keyof MatLeds

export interface MatRfLevels {
	a1: number
	b1: number
	a2: number
	b2: number
}

export type MatRfLevelsKeys = keyof MatRfLevels

export interface MatTemps {
	main: number
	rxA: number
	rxB: number
}

export type MatTempsKeys = keyof MatTemps

export interface MatVoltages {
	/** External supply voltage in mV */
	ext: number
	/** +8 V rail in mV */
	_8mv: number
	/** +5 V rail in mV */
	_5mv: number
	/** +12 V rail in mV */
	_12mv: number
}

export type MatVoltagesKeys = keyof MatVoltages

export interface MatDisplay {
	timeout: number
	brightness: number
}

export type MatDisplayKeys = keyof MatDisplay

export interface AntennaLeds {
	pendingEvents: boolean
	pendingErrors: boolean
	alarmBoost: AntennaAlarmLed
	zone: AntennaZoneColors
}

export type AntennaLedsKeys = keyof AntennaLeds

export interface AntennaDetails {
	/** Boost amplifier voltage in mV, or null if the sensor is not present (non-diversity B path). */
	voltage: number | null
	/** Boost amplifier current in mA, or null if the sensor is not present (non-diversity B path). */
	current: number | null
	gain: number
}

export type AntennaDetailsKeys = keyof AntennaDetails

export interface AntennaZone {
	name: string
	leds: AntennaLeds
	active: boolean
	diversity: AntennaDiversityChoices
	boost: AntennaBoostChoices
	antenna: {
		A: AntennaDetails
		B: AntennaDetails
	}
}

export type AntennaZoneKeys = keyof AntennaZone

// ── Dropdown Choices based on the device interface ──────────────────

export type TypedDropdownChoice<T extends string | number> = { id: T; label: string }

export const MAT_ID_CHOICES = [
	{ id: 'model', label: 'Model' },
	{ id: 'option', label: 'Option' },
	{ id: 'class', label: 'Class' },
	{ id: 'hwRev', label: 'Hardware Revision' },
] as const satisfies TypedDropdownChoice<MatIdKeys>[]

export const MAT_VERSIONS_CHOICES = [
	{ id: 'type', label: 'Type' },
	{ id: 'minor', label: 'Minor Version' },
	{ id: 'major', label: 'Major Version' },
	{ id: 'muProcessor', label: 'µProcessor Version' },
] as const satisfies TypedDropdownChoice<MatVersionsKeys>[]

export const MAT_LEDS_CHOICES = [
	{ id: 'bootFailed', label: 'Boot Failed' },
	{ id: 'lock', label: 'Lock' },
	{ id: 'events', label: 'Events' },
	{ id: 'errors', label: 'Errors' },
	{ id: 'fan1', label: 'Fan 1' },
	{ id: 'fan2', label: 'Fan 2' },
	{ id: 'overTemp', label: 'Over Temperature' },
	{ id: 'ac', label: 'AC' },
	{ id: 'dc', label: 'DC' },
	{ id: 'alarm', label: 'Alarm' },
] as const satisfies TypedDropdownChoice<MatLedsKeys>[]

export const MAT_RF_LEVELS_CHOICES = [
	{ id: 'a1', label: 'RF 1A' },
	{ id: 'b1', label: 'RF 1B' },
	{ id: 'a2', label: 'RF 2A' },
	{ id: 'b2', label: 'RF 2B' },
] as const satisfies TypedDropdownChoice<MatRfLevelsKeys>[]

export const MAT_TEMPS_CHOICES = [
	{ id: 'main', label: 'Main Board' },
	{ id: 'rxA', label: 'RX A' },
	{ id: 'rxB', label: 'RX B' },
] as const satisfies TypedDropdownChoice<MatTempsKeys>[]

export const MAT_VOLTAGES_CHOICES = [
	{ id: 'ext', label: 'External DC' },
	{ id: '_8mv', label: 'Main RF (+5v)' },
	{ id: '_5mv', label: 'Main Logic (+5v)' },
	{ id: '_12mv', label: 'Main PWR (+12v)' },
] as const satisfies TypedDropdownChoice<MatVoltagesKeys>[]

export const MAT_DISPLAY_CHOICES = [
	{ id: 'timeout', label: 'Timeout' },
	{ id: 'brightness', label: 'Brightness' },
] as const satisfies TypedDropdownChoice<MatDisplayKeys>[]

export const ANTENNA_LEDS_CHOICES = [
	{ id: 'pendingEvents', label: 'Pending Events' },
	{ id: 'pendingErrors', label: 'Pending Errors' },
	{ id: 'alarmBoost', label: 'Alarm Boost' },
	{ id: 'zone', label: 'Zone Colour' },
] as const satisfies TypedDropdownChoice<AntennaLedsKeys>[]

export const ANTENNA_DETAILS_CHOICES = [
	{ id: 'voltage', label: 'Boost Voltage (V)' },
	{ id: 'current', label: 'Boost Current (mA)' },
	{ id: 'gain', label: 'Gain' },
] as const satisfies TypedDropdownChoice<AntennaDetailsKeys>[]

export const ANTENNA_ZONE_CHOICES = [
	{ id: 'name', label: 'Name' },
	{ id: 'leds', label: 'LEDs' },
	{ id: 'active', label: 'Active' },
	{ id: 'diversity', label: 'Diversity' },
	{ id: 'boost', label: 'Boost' },
	{ id: 'antenna', label: 'Antenna' },
] as const satisfies TypedDropdownChoice<AntennaZoneKeys>[]

// ── Typed event map ───────────────────────────────────────────────────────────

/**
 * Events emitted by MatApi. Each key maps to a tuple of the emit arguments.
 *
 * Connection events:
 *   'open'    — session successfully authenticated (OPEN handshake complete)
 *   'close'   — TCP connection lost or disconnect() called
 *
 * Device state events — emitted whenever that field is updated by a confirmed
 * device response, including unsolicited AUTOSTATUS events:
 *   'id'           — device identifier (model, class, hw revision)
 *   'serial'       — serial number string
 *   'versions'     — firmware version info
 *   'name'         — device name (rack label)
 *   'display'      — display timeout and brightness
 *   'leds'         — front-panel LED states (includes lock, fans, alarm, etc.)
 *   'temp'         — board temperatures
 *   'voltage'      — internal voltage rail readings
 *   'rfLevels'     — RF signal levels for the active antenna paths
 *   'matrixConfig' — antenna matrix routing configuration
 *   'zone'         — any state change on a specific zone (name, active, diversity,
 *                    boost, gain, boost diagnostics, or LED state)
 */
export interface MatEvents {
	open: []
	close: []
	id: [id: Readonly<MatId>]
	serial: [serial: string]
	versions: [versions: Readonly<MatVersions>]
	name: [name: string]
	display: [display: Readonly<MatDisplay>]
	leds: [leds: Readonly<MatLeds>]
	temp: [temp: Readonly<MatTemps>]
	voltage: [voltage: Readonly<MatVoltages>]
	rfLevels: [rf: Readonly<MatRfLevels>]
	matrixConfig: [config: AntennaMatrixChoices]
	zone: [zoneId: MatDstZones, zone: Readonly<AntennaZone>]
}

export type MatEventSubscriptions = Map<keyof MatEvents, Set<string>>

export const MAT_EVENT_NAMES = [
	'open',
	'close',
	'id',
	'serial',
	'versions',
	'name',
	'display',
	'leds',
	'temp',
	'voltage',
	'rfLevels',
	'matrixConfig',
	'zone',
] as const satisfies readonly (keyof MatEvents)[]

// ── Private device state ──────────────────────────────────────────────────────

interface DeviceState {
	id: MatId
	serial: string
	versions: MatVersions
	name: string
	display: MatDisplay
	blink: boolean
	message: string
	temp: MatTemps
	voltage: MatVoltages
	leds: MatLeds
	rf: MatRfLevels
	matrixConfig: AntennaMatrixChoices
	zones: Map<MatDstZones, AntennaZone>
}

function defaultDeviceState(): DeviceState {
	return {
		id: { model: 'UNKNOWN', option: '', class: 0, hwRev: 0 },
		serial: 'UNKNOWN',
		versions: { type: MatVersionType.RELEASE, minor: 0, major: 0, muProcessor: 0 },
		name: 'UNKNOWN',
		display: { timeout: 0, brightness: 0 },
		blink: false,
		message: '',
		temp: { main: 0, rxA: 0, rxB: 0 },
		voltage: { ext: 0, _8mv: 0, _5mv: 0, _12mv: 0 },
		leds: {
			bootFailed: false,
			lock: false,
			events: false,
			errors: false,
			fan1: false,
			fan2: false,
			overTemp: false,
			ac: false,
			dc: false,
			alarm: false,
		},
		rf: { a1: 0, b1: 0, a2: 0, b2: 0 },
		matrixConfig: AntennaMatrixChoices.Matrix8_1Driver,
		zones: new Map(),
	}
}

function defaultZone(): AntennaZone {
	return {
		name: 'UNKNOWN',
		leds: {
			pendingEvents: false,
			pendingErrors: false,
			alarmBoost: AntennaAlarmLed.OFF,
			zone: AntennaZoneColors.OFF,
		},
		active: false,
		diversity: AntennaDiversityChoices.AB,
		boost: AntennaBoostChoices.OFF,
		antenna: {
			A: { voltage: null, current: null, gain: 0 },
			B: { voltage: null, current: null, gain: 0 },
		},
	}
}

// ── Protocol helpers ──────────────────────────────────────────────────────────

/**
 * All data elements required to build a message buffer.
 * dst accepts both MatDst (device/PC) and MatDstZones (zones 1–8).
 */
export interface MatMessage {
	src: MatSrc
	dst: MatDst | MatDstZones
	token: number
	type: MatMsgType
	status: MatMsgStatus
	cmd: MatCmd
	subCmd?: SubCmdAntenna
	payload: number[]
}

interface PendingMessage {
	message: MatMessage
	resolve: (response: MatMessage) => void
	reject: (err: Error) => void
	timeout: ReturnType<typeof setTimeout>
}

class Token {
	#value = 0
	get next(): number {
		const t = this.#value
		this.#value = (this.#value + 1) % 255
		return t
	}
}

/** XOR checksum of all provided bytes. */
function calcChecksum(bytes: number[]): number {
	return bytes.reduce((chk, byte) => chk ^ byte, 0)
}

/**
 * Byte-stuff a single byte value.
 * BOF (0xC0), EOF (0xC1), and ESC (0x7D) become [0x7D, byte ^ 0x20].
 */
function byteStuff(byte: number): number[] {
	if (byte === 0xc0 || byte === 0xc1 || byte === 0x7d) return [0x7d, byte ^ 0x20]
	return [byte]
}

/**
 * Build a complete, byte-stuffed, framed buffer ready to transmit.
 *
 * Inner frame layout (pre-stuffing):
 *   SRC | DST | TOKEN | SIZE | STATUS | CMD | [SUBCMD] | [PAYLOAD…] | CHECKSUM
 *
 * SIZE = number of bytes after CMD (subCmd + payload).
 * CHECKSUM = XOR of all inner bytes (SRC through last payload byte).
 * Byte stuffing applied to every inner byte; frame wrapped with BOF / EOF.
 */
function buildMessage(msg: MatMessage): Buffer {
	const statusByte = (msg.type << 6) | (msg.status & 0x3f)
	const afterCmd: number[] = []
	if (msg.subCmd !== undefined) afterCmd.push(msg.subCmd)
	afterCmd.push(...msg.payload)

	const inner: number[] = [msg.src, msg.dst, msg.token, afterCmd.length, statusByte, msg.cmd, ...afterCmd]
	inner.push(calcChecksum(inner))

	const stuffed = inner.flatMap(byteStuff)
	return Buffer.from([MatBofEof.BOF, ...stuffed, MatBofEof.EOF])
}

/** Read a little-endian INT16 from two bytes. */
function readInt16LE(lo: number, hi: number): number {
	const raw = (hi << 8) | lo
	return raw >= 0x8000 ? raw - 0x10000 : raw
}

/** Read a little-endian UINT16 from two bytes. */
function readUint16LE(lo: number, hi: number): number {
	return (hi << 8) | lo
}

const RESPONSE_TIMEOUT_MS = 2000

// ── MatApi ────────────────────────────────────────────────────────────────────

export class MatApi extends EventEmitter<MatEvents> {
	readonly #logger = createModuleLogger('Wisycom MAT')
	readonly #token = new Token()

	#tcp: TCPHelper | null = null
	readonly #queue = new PQueue({ concurrency: 1 })
	readonly #pending = new Map<number, PendingMessage>()
	#receiveBuffer = Buffer.alloc(0)
	#isOpen = false

	/** Full device state — only mutated by response parsers. */
	#device: DeviceState = defaultDeviceState()

	private readonly host: string
	private readonly port: number
	private readonly password: string

	constructor(host: string, port: number, password: string) {
		super()
		if (!Number.isInteger(port) || port < 1 || port > 65535) {
			throw new Error(`Port out of range: ${port}`)
		}
		this.host = host
		this.port = port
		this.password = password
	}

	// ── Public state getters ────────────────────────────────────────────────

	public get isOpen(): boolean {
		return this.#isOpen
	}

	public get id(): Readonly<MatId> {
		return this.#device.id
	}

	public get serial(): string {
		return this.#device.serial
	}

	public get versions(): Readonly<MatVersions> {
		return this.#device.versions
	}

	public get name(): string {
		return this.#device.name
	}

	public get display(): Readonly<MatDisplay> {
		return this.#device.display
	}

	public get blink(): boolean {
		return this.#device.blink
	}

	public get message(): string {
		return this.#device.message
	}

	public get temp(): Readonly<MatTemps> {
		return this.#device.temp
	}

	public get voltage(): Readonly<MatVoltages> {
		return this.#device.voltage
	}

	public get leds(): Readonly<MatLeds> {
		return this.#device.leds
	}

	public get rfLevels(): Readonly<MatRfLevels> {
		return this.#device.rf
	}

	public get matrixConfig(): AntennaMatrixChoices {
		return this.#device.matrixConfig
	}

	/**
	 * Returns a readonly snapshot of all zones.
	 * Zones only appear in the map once a response for that zone has been received.
	 */
	public get zones(): ReadonlyMap<MatDstZones, Readonly<AntennaZone>> {
		return this.#device.zones
	}

	/** Returns the state for a single zone, or undefined if not yet received. */
	public zone(zoneId: MatDstZones): Readonly<AntennaZone> | undefined {
		return this.#device.zones.get(zoneId)
	}

	// ── Connection lifecycle ────────────────────────────────────────────────

	public connect(): void {
		this.disconnect()
		this.#device = defaultDeviceState()
		this.#receiveBuffer = Buffer.alloc(0)
		this.#queue.pause()

		this.#tcp = new TCPHelper(this.host, this.port)

		this.#tcp.on('connect', () => {
			this.#logger.info(`Connected to MAT at ${this.host}:${this.port}`)
			this.#doOpen()
				.then(async () => {
					this.#isOpen = true
					this.#logger.info('Session opened – starting command queue')
					this.#queue.start()
					await this.#initialRefresh()
					this.emit('open')
				})
				.catch((err: Error) => {
					this.#logger.error(`OPEN failed: ${err.message}`)
					this.disconnect()
				})
		})

		this.#tcp.on('data', (data: Buffer) => this.#onData(data))

		this.#tcp.on('error', (err: Error) => {
			this.#logger.error(`TCP error: ${err.message}`)
			this.#rejectAllPending(err)
		})

		this.#tcp.on('end', () => {
			this.#logger.info('TCP connection ended by remote')
			this.#isOpen = false
			this.#rejectAllPending(new Error('Connection closed by device'))
			this.emit('close')
		})
	}

	public disconnect(): void {
		this.#queue.pause()
		this.#queue.clear()
		this.#rejectAllPending(new Error('Disconnected'))
		this.#tcp?.destroy()
		this.#tcp = null
		if (this.#isOpen) {
			this.#isOpen = false
			this.emit('close')
		}
	}

	// ── Internal helpers ────────────────────────────────────────────────────

	#rejectAllPending(err: Error): void {
		for (const [token, pending] of this.#pending) {
			clearTimeout(pending.timeout)
			pending.reject(err)
			this.#pending.delete(token)
		}
	}

	#buildMsg(opts: {
		src?: MatSrc
		dst?: MatDst | MatDstZones
		type?: MatMsgType
		status?: MatMsgStatus
		cmd: MatCmd
		subCmd?: SubCmdAntenna
		payload?: number[]
	}): MatMessage {
		return {
			src: opts.src ?? MatSrc.PC,
			dst: opts.dst ?? MatDst.DEVICE,
			token: this.#token.next,
			type: opts.type ?? MatMsgType.CMD,
			status: opts.status ?? MatMsgStatus.OK,
			cmd: opts.cmd,
			subCmd: opts.subCmd,
			payload: opts.payload ?? [],
		}
	}

	async #send(msg: MatMessage): Promise<MatMessage> {
		const buffer = buildMessage(msg)

		return new Promise<MatMessage>((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.#pending.delete(msg.token)
				reject(new Error(`Response timeout for token ${msg.token} (cmd 0x${msg.cmd.toString(16)})`))
			}, RESPONSE_TIMEOUT_MS)

			this.#pending.set(msg.token, { message: msg, resolve, reject, timeout })

			this.#tcp
				?.sendAsync(buffer)
				.then((sent) => {
					if (!(sent ?? false)) {
						clearTimeout(timeout)
						this.#pending.delete(msg.token)
						reject(new Error('Send failed – socket not connected'))
					}
				})
				.catch((err: Error) => {
					clearTimeout(timeout)
					this.#pending.delete(msg.token)
					reject(err)
				})
		})
	}

	/** Queued send — requires an open session. */
	async #queueSend(msg: MatMessage): Promise<MatMessage> {
		if (!this.#isOpen) return Promise.reject(new Error('Session not open'))
		return this.#queue.add(async () => this.#send(msg))
	}

	/** Queued send — for the four commands available without OPEN. */
	async #queueSendNoAuth(msg: MatMessage): Promise<MatMessage> {
		return this.#queue.add(async () => this.#send(msg))
	}

	// ── Receive pipeline ────────────────────────────────────────────────────

	#onData(data: Buffer): void {
		this.#receiveBuffer = Buffer.concat([this.#receiveBuffer, data])
		while (this.#receiveBuffer.length > 0) {
			const bof = this.#receiveBuffer.indexOf(MatBofEof.BOF)
			if (bof === -1) {
				this.#receiveBuffer = Buffer.alloc(0)
				break
			}
			if (bof > 0) {
				this.#logger.warn(`Discarding ${bof} bytes before BOF`)
				this.#receiveBuffer = this.#receiveBuffer.slice(bof)
			}
			// A stuffed EOF appears as 0x7D 0xE1, so a bare 0xC1 is always the real EOF
			const eof = this.#receiveBuffer.indexOf(MatBofEof.EOF, 1)
			if (eof === -1) break
			const frame = this.#receiveBuffer.slice(0, eof + 1)
			this.#receiveBuffer = this.#receiveBuffer.slice(eof + 1)
			this.#parseFrame(frame)
		}
	}

	#parseFrame(frame: Buffer): void {
		this.#logger.debug(`Frame RX: ${frame.toString('hex')}`)

		// Reverse byte stuffing (skip BOF [0] and EOF [last])
		const inner: number[] = []
		for (let i = 1; i < frame.length - 1; i++) {
			if (frame[i] === 0x7d) {
				i++
				if (i < frame.length - 1) inner.push(frame[i] ^ 0x20)
			} else {
				inner.push(frame[i])
			}
		}

		// Minimum: SRC DST TOKEN SIZE STATUS CMD CHECKSUM = 7 bytes
		if (inner.length < 7) {
			this.#logger.warn(`Frame too short after unstuffing (${inner.length} bytes)`)
			return
		}

		const src = inner[0]
		const dst = inner[1]
		const token = inner[2]
		const size = inner[3]
		const statusByte = inner[4]
		const cmd = inner[5]

		if (inner.length < 6 + size + 1) {
			this.#logger.warn(`Frame length mismatch: expected ${6 + size + 1}, got ${inner.length}`)
			return
		}

		const payload = inner.slice(6, 6 + size)
		const receivedChecksum = inner[6 + size]
		const computedChecksum = calcChecksum(inner.slice(0, 6 + size))

		if (computedChecksum !== receivedChecksum) {
			this.#logger.warn(
				`Checksum mismatch: computed 0x${computedChecksum.toString(16).padStart(2, '0')}, ` +
					`received 0x${receivedChecksum.toString(16).padStart(2, '0')}`,
			)
		}

		const type: MatMsgType = statusByte >> 6
		const status: MatMsgStatus = statusByte & 0x3f
		const parsedMsg: MatMessage = { src, dst, token, type, status, cmd, payload }

		if (type === MatMsgType.EVT) {
			this.#handleEvent(parsedMsg)
			return
		}

		const pending = this.#pending.get(token)
		if (!pending) {
			this.#logger.warn(`No pending command for token ${token} (cmd 0x${cmd.toString(16)})`)
			return
		}

		clearTimeout(pending.timeout)
		this.#pending.delete(token)

		if (status === MatMsgStatus.OK) {
			this.#updateState(parsedMsg)
			pending.resolve(parsedMsg)
		} else {
			pending.reject(
				new Error(
					`Command 0x${cmd.toString(16)} - ${MatCmd[cmd]} failed: status 0x${status.toString(16).padStart(2, '0')} - ${MatMsgStatus[status]}`,
				),
			)
		}
	}

	// ── Device state updaters ─────────────────────────────────────────────────

	/**
	 * Route a confirmed CMD_ACK response to the appropriate state updater.
	 * Only called on successful (status=OK) responses, and by #handleEvent for
	 * unsolicited STATUS payloads.
	 */
	#updateState(msg: MatMessage): void {
		switch (msg.cmd) {
			case MatCmd.ID:
				return this.#parseId(msg.payload)
			case MatCmd.SERIAL:
				return this.#parseSerial(msg.payload)
			case MatCmd.APP_VER:
				return this.#parseAppver(msg.payload)
			case MatCmd.NAME:
				return this.#parseName(msg.src, msg.payload)
			case MatCmd.DISPLAY:
				return this.#parseDisplay(msg.payload)
			case MatCmd.LOCK:
				return this.#parseLock(msg.payload)
			case MatCmd.MESSAGE:
				return this.#parseMessage(msg.payload)
			case MatCmd.TEMP:
				return this.#parseTemp(msg.payload)
			case MatCmd.VOLTAGE:
				return this.#parseVoltage(msg.payload)
			case MatCmd.STATUS:
				return this.#parseStatus(msg.payload)
			case MatCmd.ANTENNA:
				return this.#parseAntenna(msg.src, msg.payload)
			// OPEN, CLOSE, SAVE_PAR, AUTO_STATUS carry no state to update
		}
	}

	#parseId(p: number[]): void {
		if (p.length < 10) return
		this.#device.id = {
			model: String.fromCharCode(...p.slice(0, 7))
				.replace(/\0/g, '')
				.trim(),
			option: String.fromCharCode(p[7]).replace(/\0/g, ''),
			class: p[8],
			hwRev: p[9],
		}
		this.emit('id', this.#device.id)
	}

	#parseSerial(p: number[]): void {
		this.#device.serial = String.fromCharCode(...p)
			.replace(/\0/g, '')
			.trim()
		this.emit('serial', this.#device.serial)
	}

	#parseAppver(p: number[]): void {
		if (p.length < 8) return
		// B0: 0x64='d'=DEBUG, 0x72='r'=RELEASE, 0xFF=PRODUCTION_RELEASE
		const rawVersion = p[0]
		const type: MatVersionType = isMatVersionType(rawVersion) ? rawVersion : MatVersionType.PRODUCTION_RELEASE
		this.#device.versions = {
			type,
			minor: p[1],
			major: p[2],
			// B3 = 0 (padding); B4/B5/B6 = µProcessor version as a 24-bit little-endian value
			muProcessor: p[4] | (p[5] << 8) | (p[6] << 16),
		}
		this.emit('versions', this.#device.versions)
	}

	#parseName(src: MatSrc | MatDstZones, p: number[]): void {
		const name = String.fromCharCode(...p)
			.replace(/\0/g, '')
			.trim()
		if (src === MatSrc.Device) {
			this.#device.name = name
			this.emit('name', name)
		} else {
			const zoneId = src as MatDstZones
			const zone = this.#getOrCreateZone(zoneId)
			zone.name = name
			this.emit('zone', zoneId, zone)
		}
	}

	#parseDisplay(p: number[]): void {
		if (p.length < 2) return
		this.#device.display = { timeout: p[0], brightness: p[1] }
		this.emit('display', this.#device.display)
	}

	#parseLock(p: number[]): void {
		if (p.length < 1) return
		this.#device.leds = { ...this.#device.leds, lock: p[0] === 1 }
		this.emit('leds', this.#device.leds)
	}

	#parseMessage(p: number[]): void {
		if (p.length < 1) return
		this.#device.blink = p[0] === 1
		this.#device.message =
			p.length > 1
				? String.fromCharCode(...p.slice(1))
						.replace(/\0/g, '')
						.trim()
				: ''
		// blink and message are readable via getters but have no dedicated event —
		// callers that need them can read the getters after any other state event,
		// or listen for the broader 'leds' / general polling pattern.
	}

	#parseTemp(p: number[]): void {
		if (p.length < 2) return
		this.#device.temp = {
			main: p[0],
			rxA: p[1],
			rxB: p.length >= 3 ? p[2] : 0,
		}
		this.emit('temp', this.#device.temp)
	}

	#parseVoltage(p: number[]): void {
		// Four UINT16 little-endian words; values are ×100 mV
		if (p.length < 8) return
		this.#device.voltage = {
			ext: readUint16LE(p[0], p[1]),
			_8mv: readUint16LE(p[2], p[3]),
			_5mv: readUint16LE(p[4], p[5]),
			_12mv: readUint16LE(p[6], p[7]),
		}
		this.emit('voltage', this.#device.voltage)
	}

	#parseStatus(p: number[]): void {
		if (p.length < 8) return

		const b0 = p[0]
		const b1 = p[1]

		this.#device.leds = {
			bootFailed: !!(b0 & 0x01),
			lock: !!(b0 & 0x02),
			events: !!(b0 & 0x08),
			errors: !!(b0 & 0x10),
			fan1: !!(b1 & 0x01),
			fan2: !!(b1 & 0x02),
			overTemp: !!(b1 & 0x04),
			ac: !!(b1 & 0x08),
			dc: !!(b1 & 0x10),
			alarm: !!(b1 & 0x40),
		}
		this.emit('leds', this.#device.leds)

		// Pending events/errors per zone — B2 covers zones 1–4, B3 covers zones 5–8
		for (let z = 0; z < 8; z++) {
			const byteIdx = Math.floor(z / 4)
			const bitBase = (z % 4) * 2
			const events = !!(p[2 + byteIdx] & (1 << bitBase))
			const errors = !!(p[2 + byteIdx] & (1 << (bitBase + 1)))
			const zoneId = z + 1
			const zone = this.#getOrCreateZone(zoneId)
			zone.leds = { ...zone.leds, pendingEvents: events, pendingErrors: errors }
			// Zone emit deferred — we update all zone fields before emitting below
			// Clear any events
			if (events || errors) void this.#handlePendingEvent(zoneId)
		}

		// Alarm boost per antenna — B4 covers antennas 1–4, B5 covers 5–8
		for (let z = 0; z < 8; z++) {
			const byteIdx = Math.floor(z / 4)
			const bitBase = (z % 4) * 2
			const alarmA = !!(p[4 + byteIdx] & (1 << bitBase))
			const alarmB = !!(p[4 + byteIdx] & (1 << (bitBase + 1)))
			const isDiversity = IS_DIVERSITY[normaliseModel(this.#device.id.model)][this.#device.matrixConfig]
			const zone = this.#getOrCreateZone(z + 1)
			zone.leds = {
				...zone.leds,
				alarmBoost: alarmA || (isDiversity && alarmB) ? AntennaAlarmLed.ERROR : AntennaAlarmLed.OFF,
			}
		}

		// Zone LED colours — 2 bits per zone; B6 covers zones 1–4, B7 covers zones 5–8
		for (let z = 0; z < 8; z++) {
			const byteIdx = Math.floor(z / 4)
			const bitBase = (z % 4) * 2
			const color = (p[6 + byteIdx] >> bitBase) & 0x03
			const zoneId = z + 1
			const zone = this.#getOrCreateZone(zoneId)
			zone.leds = { ...zone.leds, zone: color }
			// All three zone LED fields (pending events/errors, alarm boost, colour) are
			// now written — emit once per zone with the fully updated state.
			this.emit('zone', zoneId, zone)
		}

		// RF levels — four INT16 little-endian words; divide by 100 for dBFS
		if (p.length >= 16) {
			this.#device.rf = {
				a1: readInt16LE(p[8], p[9]),
				b1: readInt16LE(p[10], p[11]),
				a2: readInt16LE(p[12], p[13]),
				b2: readInt16LE(p[14], p[15]),
			}
			this.emit('rfLevels', this.#device.rf)
		}
	}

	#parseAntenna(dst: MatDstZones | MatSrc, p: number[]): void {
		if (p.length < 1) return
		const subCmd: SubCmdAntenna = p[0]
		const data = p.slice(1)

		// MATRIX targets the device (dst=0x00), not a zone
		if (subCmd === SubCmdAntenna.MATRIX) {
			if (data.length >= 1) {
				this.#device.matrixConfig = data[0]
				this.emit('matrixConfig', this.#device.matrixConfig)
			}
			return
		}

		const zoneId = dst as MatDstZones
		const zone = this.#getOrCreateZone(zoneId)

		switch (subCmd) {
			case SubCmdAntenna.ACTIVATE:
				if (data.length >= 1) zone.active = data[0] === 1
				break
			case SubCmdAntenna.DIVERSITY:
				if (data.length >= 1) zone.diversity = data[0]
				break
			case SubCmdAntenna.BOOST:
				if (data.length >= 1) zone.boost = data[0]
				break
			case SubCmdAntenna.GAIN:
				if (data.length >= 2) {
					const antenna: 'A' | 'B' = data[0] === 0 ? 'A' : 'B'
					zone.antenna[antenna].gain = data[1]
				}
				break
			case SubCmdAntenna.BOOST_DIAG: {
				// UINT16 LE: Voltage A, Current A, Voltage B, Current B
				// 0xFFFF indicates the sensor is not present (B path in non-diversity mode)
				if (data.length >= 8) {
					const u16 = (lo: number, hi: number): number | null => {
						const v = readUint16LE(lo, hi)
						return v === 0xffff ? null : v
					}
					zone.antenna.A.voltage = u16(data[0], data[1])
					zone.antenna.A.current = u16(data[2], data[3])
					zone.antenna.B.voltage = u16(data[4], data[5])
					zone.antenna.B.current = u16(data[6], data[7])
				}
				break
			}
		}

		this.emit('zone', zoneId, zone)
	}

	#getOrCreateZone(zoneId: MatDstZones): AntennaZone {
		if (!this.#device.zones.has(zoneId)) this.#device.zones.set(zoneId, defaultZone())
		return this.#device.zones.get(zoneId)!
	}

	// ── Event handler ─────────────────────────────────────────────────────────

	#handleEvent(msg: MatMessage): void {
		this.#logger.debug(
			`EVT cmd=0x${msg.cmd.toString(16)} token=${msg.token} ` +
				`payload=[${msg.payload.map((b) => b.toString(16).padStart(2, '0')).join(' ')}]`,
		)
		// AUTOSTATUS sends a STATUS payload as an unsolicited EVT — route it through
		// the same updater so all state and events are handled identically.
		if (msg.cmd === MatCmd.STATUS) this.#parseStatus(msg.payload)
	}

	/**
	 * Sends command 0x0E (CLEAR) to the zone to acknowledge a pending event.
	 * If the device replies with payload[0] === 0x01 (parameter modified locally),
	 * re-fetches all zone parameters so internal state stays in sync with
	 * any changes made via the device's front panel.
	 */
	async #handlePendingEvent(zoneId: MatDstZones): Promise<void> {
		try {
			const response = await this.clearPendingEvent(zoneId)
			if (response.payload[0] === 0x01) {
				await this.#refreshZone(zoneId)
			}
		} catch (err) {
			this.#logger.warn(`Pending event handling failed for zone ${zoneId}: ${(err as Error).message}`)
		}
	}

	/**
	 * Re-fetches all zone parameters after the device signals a local modification.
	 * Follows the refresh sequence defined in the protocol spec's
	 * "Pending events management" section. Each query updates internal state via
	 * the normal response parsers, so 'zone' events are emitted for each changed field.
	 */
	async #refreshZone(zoneId: MatDstZones): Promise<void> {
		await this.setName(zoneId)
		await this.setAntennaActivate(zoneId)
		await this.setAntennaDiversity(zoneId)
		await this.setAntennaBoost(zoneId)
		await this.queryAntennaGain(zoneId, AntennaDiversityChoices.A)
		await this.queryAntennaGain(zoneId, AntennaDiversityChoices.B)
		await this.queryAntennaBoostDiag(zoneId)
	}

	// ── Session management ────────────────────────────────────────────────────

	async #doOpen(): Promise<void> {
		const payload: number[] = []
		const pwd = this.password.substring(0, 8)
		for (let i = 0; i < pwd.length; i++) payload.push(pwd.charCodeAt(i))
		await this.#send(this.#buildMsg({ cmd: MatCmd.OPEN, payload }))
	}

	async #initialRefresh(): Promise<void> {
		// Device-level queries
		await this.queryId()
		await this.querySerial()
		await this.queryAppver()
		await this.setName(MatDst.DEVICE)
		await this.setDisplay()
		await this.setLock()
		await this.queryTemp()
		await this.queryVoltage()
		await this.setAntennaMatrix()
		await this.queryStatus()

		// Zone-level queries for all 8 zones
		for (const zoneId of [1, 2, 3, 4, 5, 6, 7, 8] as MatDstZones[]) {
			await this.#refreshZone(zoneId)
		}
	}

	// ── Public command API ────────────────────────────────────────────────────

	public async close(): Promise<MatMessage> {
		this.#isOpen = false
		return this.#queueSend(this.#buildMsg({ cmd: MatCmd.CLOSE }))
	}

	/** Available without OPEN. */
	public async queryId(): Promise<MatMessage> {
		return this.#queueSendNoAuth(this.#buildMsg({ cmd: MatCmd.ID }))
	}

	/** Available without OPEN. */
	public async querySerial(): Promise<MatMessage> {
		return this.#queueSendNoAuth(this.#buildMsg({ cmd: MatCmd.SERIAL }))
	}

	/** Available without OPEN. */
	public async queryAppver(): Promise<MatMessage> {
		return this.#queueSendNoAuth(this.#buildMsg({ cmd: MatCmd.APP_VER }))
	}

	/** Available without OPEN. */
	public async queryStatus(): Promise<MatMessage> {
		return this.#queueSendNoAuth(this.#buildMsg({ cmd: MatCmd.STATUS }))
	}

	/**
	 * Read or write the name of the device or a zone.
	 * Omit `name` to read; supply it to write (max 8 chars).
	 */
	public async setName(dst: Exclude<MatDst, MatDst.PC> | MatDstZones, name?: string): Promise<MatMessage> {
		const payload: number[] = []
		if (name !== undefined) {
			const clean = name.trim().substring(0, 8)
			for (let i = 0; i < clean.length; i++) payload.push(clean.charCodeAt(i))
		}
		return this.#queueSend(this.#buildMsg({ dst, cmd: MatCmd.NAME, payload }))
	}

	/** Omit `options` to read current values. */
	public async setDisplay(options?: { timeout: number; brightness: number }): Promise<MatMessage> {
		const payload: number[] = []
		if (options !== undefined) {
			payload.push(Math.round(Math.min(255, Math.max(0, options.timeout))))
			payload.push(Math.round(Math.min(255, Math.max(0, options.brightness))))
		}
		return this.#queueSend(this.#buildMsg({ cmd: MatCmd.DISPLAY, payload }))
	}

	/** Omit `options` to read. */
	public async setLock(options?: { lock: boolean }): Promise<MatMessage> {
		const payload: number[] = []
		if (options !== undefined) payload.push(Number(options.lock))
		return this.#queueSend(this.#buildMsg({ cmd: MatCmd.LOCK, payload }))
	}

	/** Omit `options` to cancel any active message. */
	public async setMessage(options?: { blink: boolean; message?: string }): Promise<MatMessage> {
		const payload: number[] = []
		if (options !== undefined) {
			payload.push(Number(options.blink))
			if (options.message) {
				const clean = options.message.trim().substring(0, 40)
				for (let i = 0; i < clean.length; i++) payload.push(clean.charCodeAt(i))
			}
		}
		return this.#queueSend(this.#buildMsg({ cmd: MatCmd.MESSAGE, payload }))
	}

	public async queryTemp(): Promise<MatMessage> {
		return this.#queueSend(this.#buildMsg({ cmd: MatCmd.TEMP }))
	}

	/** Returned values are ×100 mV — divide by 100 to get volts. */
	public async queryVoltage(): Promise<MatMessage> {
		return this.#queueSend(this.#buildMsg({ cmd: MatCmd.VOLTAGE }))
	}

	public async saveParam(): Promise<MatMessage> {
		return this.#queueSend(this.#buildMsg({ cmd: MatCmd.SAVE_PAR }))
	}

	public async clearPendingEvent(zone: MatDstZones): Promise<MatMessage> {
		return this.#queueSend(this.#buildMsg({ cmd: MatCmd.CLEAR, dst: zone }))
	}

	/**
	 * Enable or disable automatic STATUS transmission.
	 * @param enable      Default true
	 * @param intervalMs  Minimum 20 ms, default 32 ms
	 */
	public async setAutostatus(enable = true, intervalMs = 32): Promise<MatMessage> {
		const clamped = Math.max(20, Math.round(intervalMs))
		const payload = [Number(enable), clamped & 0xff, (clamped >> 8) & 0xff]
		return this.#queueSend(this.#buildMsg({ cmd: MatCmd.AUTO_STATUS, payload }))
	}

	/** Omit `options` to read. */
	public async setAntennaMatrix(options?: { selection: AntennaMatrixChoices }): Promise<MatMessage> {
		const payload: number[] = []
		if (options !== undefined) payload.push(options.selection)
		return this.#queueSend(this.#buildMsg({ cmd: MatCmd.ANTENNA, subCmd: SubCmdAntenna.MATRIX, payload }))
	}

	/** Omit `options` to read. */
	public async setAntennaActivate(zone: MatDstZones, options?: { activation: MatBooleanChoices }): Promise<MatMessage> {
		const payload: number[] = []
		if (options !== undefined) payload.push(options.activation)
		return this.#queueSend(this.#buildMsg({ cmd: MatCmd.ANTENNA, subCmd: SubCmdAntenna.ACTIVATE, dst: zone, payload }))
	}

	/** Omit `options` to read. */
	public async setAntennaDiversity(
		zone: MatDstZones,
		options?: { diversity: AntennaDiversityChoices },
	): Promise<MatMessage> {
		const payload: number[] = []
		if (options !== undefined) payload.push(options.diversity)
		return this.#queueSend(this.#buildMsg({ cmd: MatCmd.ANTENNA, subCmd: SubCmdAntenna.DIVERSITY, dst: zone, payload }))
	}

	/** Omit `options` to read. */
	public async setAntennaBoost(zone: MatDstZones, options?: { boost: AntennaBoostChoices }): Promise<MatMessage> {
		const payload: number[] = []
		if (options !== undefined) payload.push(options.boost)
		return this.#queueSend(this.#buildMsg({ cmd: MatCmd.ANTENNA, subCmd: SubCmdAntenna.BOOST, dst: zone, payload }))
	}

	/** Omit `options` to read both paths. */
	public async setAntennaGain(
		zone: MatDstZones,
		options?: { selection: AntennaDiversityChoices; attenuation: number },
	): Promise<MatMessage> {
		const payload: number[] = []
		if (options !== undefined) {
			payload.push(options.selection)
			payload.push(Math.round(Math.min(63, Math.max(0, options.attenuation))))
		}
		return this.#queueSend(this.#buildMsg({ cmd: MatCmd.ANTENNA, subCmd: SubCmdAntenna.GAIN, dst: zone, payload }))
	}

	public async queryAntennaBoostDiag(zone: MatDstZones): Promise<MatMessage> {
		return this.#queueSend(
			this.#buildMsg({ cmd: MatCmd.ANTENNA, subCmd: SubCmdAntenna.BOOST_DIAG, dst: zone, payload: [] }),
		)
	}

	/**
	 * Read the gain for a specific antenna path.
	 * Sends a 1-byte payload (path selector only), matching the path-specific
	 * read format used in the pending-event refresh sequence per the protocol spec.
	 */
	public async queryAntennaGain(zone: MatDstZones, path: AntennaDiversityChoices): Promise<MatMessage> {
		return this.#queueSend(
			this.#buildMsg({
				cmd: MatCmd.ANTENNA,
				subCmd: SubCmdAntenna.GAIN,
				dst: zone,
				payload: [path],
			}),
		)
	}
}
