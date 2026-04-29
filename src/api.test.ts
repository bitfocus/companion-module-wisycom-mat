/**
 * Unit tests for MatApi
 *
 * Tests cover:
 *  - Constructor validation
 *  - Frame building (byte stuffing, checksum)
 *  - Connection lifecycle and OPEN handshake
 *  - State parsing for every response type
 *  - Event emission
 *  - Error handling (timeout, send failure, bad checksum, error status)
 *  - Edge cases (partial frames, byte-stuffed data, MAT244 alarm masking,
 *    AUTOSTATUS EVT routing, clearPendingEvent on pending events)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MatApi } from './api.js'
import {
	MatCmd,
	MatDst,
	MatVersionType,
	AntennaDiversityChoices,
	AntennaBoostChoices,
	AntennaMatrixChoices,
	AntennaAlarmLed,
	AntennaZoneColors,
	type MatDstZones,
} from './enum.js'

// ── Mocks ─────────────────────────────────────────────────────────────────────

/** Captured TCP event handlers, reset per test */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
let tcpHandlers: Record<string, Function> = {}

const mockTCP = {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
	on: vi.fn((event: string, fn: Function) => {
		tcpHandlers[event] = fn
	}),
	sendAsync: vi.fn().mockResolvedValue(true),
	destroy: vi.fn(),
}

vi.mock('@companion-module/base', () => ({
	TCPHelper: class {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
		on(event: string, fn: Function) {
			tcpHandlers[event] = fn
		}
		async sendAsync(buf: Buffer) {
			return mockTCP.sendAsync(buf)
		}
		destroy() {
			mockTCP.destroy()
		}
	},
	createModuleLogger: vi.fn(() => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	})),
}))

// PQueue mock — concurrency 1, immediately executes the queued function
vi.mock('p-queue', () => ({
	default: class {
		async add(fn: () => Promise<unknown>) {
			return fn()
		}
		pause() {}
		start() {}
		clear() {}
	},
}))

// zones.js mock — used by #parseStatus for alarm boost masking
vi.mock('./zones.js', () => ({
	IS_DIVERSITY: {
		MAT288: { 0: true, 1: true, 2: true },
		MAT244: { 0: false, 1: false, 2: true },
	},
	normaliseModel: (model: string) => (model.includes('244') ? 'MAT244' : 'MAT288'),
}))

// ── Frame helpers ─────────────────────────────────────────────────────────────

const BOF = 0xc0
const EOF = 0xc1
/** CMD_ACK with OK status byte */
const CMD_ACK_OK = (0x01 << 6) | 0x00 // 0x40
/** EVT with OK status byte */
const EVT_OK = (0x02 << 6) | 0x00 // 0x80

/**
 * Build a complete byte-stuffed framed message, mirroring the device's
 * wire format so we can feed it to the parser as if it arrived over TCP.
 */
function buildFrame(
	src: number,
	dst: number,
	token: number,
	statusByte: number,
	cmd: number,
	payload: number[],
): Buffer {
	const inner = [src, dst, token, payload.length, statusByte, cmd, ...payload]
	const checksum = inner.reduce((xor, b) => xor ^ b, 0)
	inner.push(checksum)

	const stuffed: number[] = []
	for (const b of inner) {
		if (b === 0xc0 || b === 0xc1 || b === 0x7d) {
			stuffed.push(0x7d, b ^ 0x20)
		} else {
			stuffed.push(b)
		}
	}
	return Buffer.from([BOF, ...stuffed, EOF])
}

/** CMD_ACK from the device (SRC=0x00, DST=PC=0xFE) */
const deviceAck = (token: number, cmd: number, payload: number[] = []): Buffer =>
	buildFrame(0x00, 0xfe, token, CMD_ACK_OK, cmd, payload)

/** CMD_ACK from a specific zone */
const zoneAck = (zoneId: number, token: number, cmd: number, payload: number[] = []): Buffer =>
	buildFrame(zoneId, 0xfe, token, CMD_ACK_OK, cmd, payload)

/** EVT frame (e.g. AUTOSTATUS push) */
const evtFrame = (token: number, cmd: number, payload: number[] = []): Buffer =>
	buildFrame(0x00, 0xfe, token, EVT_OK, cmd, payload)

/** CMD_ACK with an error status code */
const errorAck = (token: number, cmd: number, statusCode: number): Buffer =>
	buildFrame(0x00, 0xfe, token, (0x01 << 6) | statusCode, cmd, [])

/**
 * Generate a minimal valid response payload for a given command.
 * Mirrors the full command set used by #initialRefresh and #refreshZone.
 */
function autoRespondPayload(cmd: MatCmd, sentPayloadBytes: number[]): number[] {
	switch (cmd) {
		case MatCmd.OPEN:
			return [0x00]
		case MatCmd.ID:
			return [...Buffer.from('MAT288\0'), 0x00, 0x01, 0x01]
		case MatCmd.SERIAL:
			return [...Buffer.from('U0000000\0\0')]
		case MatCmd.APP_VER:
			return [0xff, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]
		case MatCmd.NAME:
			return []
		case MatCmd.DISPLAY:
			return [0x00, 0x00]
		case MatCmd.LOCK:
			return [0x00]
		case MatCmd.TEMP:
			return [0x00, 0x00, 0x00]
		case MatCmd.VOLTAGE:
			return [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
		case MatCmd.STATUS:
			return [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
		case MatCmd.CLEAR:
			return []
		case MatCmd.ANTENNA: {
			const subCmd = sentPayloadBytes[0]
			switch (subCmd) {
				case 0x00:
					return [0x00, 0x00] // MATRIX
				case 0x01:
					return [0x01, 0x00] // ACTIVATE
				case 0x02:
					return [0x02, 0x02] // DIVERSITY: AB
				case 0x03:
					return [0x03, 0x00] // BOOST: OFF
				case 0x04:
					return [0x04, sentPayloadBytes[1] ?? 0x00, 0x00] // GAIN
				default:
					return [subCmd]
			}
		}
		default:
			return []
	}
}

/**
 * Install a sendAsync mock that responds to every command with a valid
 * minimal frame, echoing the actual sent token and honouring zone
 * destinations (response src = sent dst for zone-addressed commands).
 */
function installAutoResponder(): void {
	mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
		const inner = unstuff(buf)
		const token = inner[2]
		const dst = inner[1]
		const cmd = inner[5]
		const size = inner[3]
		const payloadBytes = inner.slice(6, 6 + size)
		const responseSrc = dst >= 0x01 && dst <= 0x08 ? dst : 0x00
		const responsePayload = autoRespondPayload(cmd, payloadBytes)
		tcpHandlers['data'](buildFrame(responseSrc, 0xfe, token, CMD_ACK_OK, cmd, responsePayload))
		return true
	})
}

/**
 * Set up sendAsync so the next command gets a fixed response using the
 * actual sent token — token-agnostic replacement for the old sendAndRespond.
 */
function respondWith(cmd: MatCmd, payload: number[], src = 0x00): void {
	mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
		tcpHandlers['data'](buildFrame(src, 0xfe, sentToken(buf), CMD_ACK_OK, cmd, payload))
		return true
	})
}
/**
 * Parse the inner (de-stuffed) bytes from a framed buffer.
 * Used to inspect what the class actually sent over the wire.
 */
function unstuff(buffer: Buffer): number[] {
	const inner: number[] = []
	for (let i = 1; i < buffer.length - 1; i++) {
		if (buffer[i] === 0x7d) {
			i++
			if (i < buffer.length - 1) inner.push(buffer[i] ^ 0x20)
		} else {
			inner.push(buffer[i])
		}
	}
	return inner
}

/** Extract the token from a sent buffer */
const sentToken = (buf: Buffer): number => unstuff(buf)[2]
/** Extract the command byte from a sent buffer */
const sentCmd = (buf: Buffer): MatCmd => unstuff(buf)[5]
/** Extract the payload bytes from a sent buffer */
const sentPayload = (buf: Buffer): number[] => {
	const inner = unstuff(buf)
	const size = inner[3]
	return inner.slice(6, 6 + size)
}

// ── Flush helpers ─────────────────────────────────────────────────────────────

/** Yield control to allow pending microtasks (Promise chains) to settle */
const flush = async (ticks = 3): Promise<void> => {
	for (let i = 0; i < ticks; i++) await Promise.resolve()
}

// ── Connected API factory ─────────────────────────────────────────────────────

/**
 * Create a MatApi and drive it through the full connection + OPEN handshake.
 * After this returns:
 *   - TCP 'connect' has fired
 *   - OPEN (token 0) has been sent and acknowledged
 *   - #isOpen = true, queue is running
 *   - The next outbound token will be 1
 */
async function createConnectedApi(password = ''): Promise<MatApi> {
	const api = new MatApi('192.168.1.100', 2101, password)
	installAutoResponder()
	api.connect()
	await flush()
	tcpHandlers['connect']()
	// 500 ticks: covers OPEN + 10 device queries + 8 zones × 6 queries each
	await flush(500)
	return api
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MatApi', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		tcpHandlers = {}
		mockTCP.on.mockClear()
		mockTCP.sendAsync.mockClear()
		mockTCP.destroy.mockClear()
		mockTCP.sendAsync.mockResolvedValue(true)
	})

	afterEach(async () => {
		vi.clearAllTimers()
		vi.useRealTimers()
		vi.clearAllMocks()
	})

	// ── Constructor ─────────────────────────────────────────────────────────

	describe('constructor', () => {
		it('accepts a valid port', () => {
			expect(() => new MatApi('192.168.1.1', 2101, '')).not.toThrow()
		})

		it.each([0, -1, 65536, 99999])('rejects out-of-range port %i', (port) => {
			expect(() => new MatApi('192.168.1.1', port, '')).toThrow('Port out of range')
		})

		it('rejects a non-integer port', () => {
			expect(() => new MatApi('192.168.1.1', 21.5, '')).toThrow('Port out of range')
		})

		it('initialises with default device state', () => {
			const api = new MatApi('192.168.1.1', 2101, '')
			expect(api.id.model).toBe('UNKNOWN')
			expect(api.serial).toBe('UNKNOWN')
			expect(api.name).toBe('UNKNOWN')
			expect(api.isOpen).toBe(false)
			expect(api.zones.size).toBe(0)
		})
	})

	// ── Frame building ───────────────────────────────────────────────────────

	describe('outbound frame building', () => {
		it('sends a correctly framed ID command', async () => {
			const api = await createConnectedApi()
			mockTCP.sendAsync.mockClear()
			mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
				tcpHandlers['data'](
					deviceAck(sentToken(buf), MatCmd.ID, [...Buffer.from('MAT288\0')].concat([0x00, 0x00, 0x01])),
				)
				return true
			})

			await api.queryId()

			const [buf] = mockTCP.sendAsync.mock.calls[0] as [Buffer]
			expect(buf[0]).toBe(BOF)
			expect(buf[buf.length - 1]).toBe(EOF)
			expect(sentCmd(buf)).toBe(MatCmd.ID)
			expect(sentPayload(buf)).toHaveLength(0) // ID is a read-only query, no payload
		})

		it('includes password bytes in OPEN payload', async () => {
			const api = new MatApi('192.168.1.1', 2101, 'secret')
			api.connect()
			await flush()
			tcpHandlers['connect']()
			await flush()

			const [openBuf] = mockTCP.sendAsync.mock.calls[0] as [Buffer]
			const payload = sentPayload(openBuf)

			// 'secret' → [0x73, 0x65, 0x63, 0x72, 0x65, 0x74]
			expect(payload).toEqual([...Buffer.from('secret')])
		})

		it('byte-stuffs 0xC0 in payload', async () => {
			// Verify that a payload byte of 0xC0 (BOF) gets stuffed to [0x7D, 0xE0]
			// We can observe this by inspecting the raw sent buffer
			// Since we cannot inject a payload containing 0xC0 through the public API easily,
			// we verify via the OPEN command with a password containing char code 0xC0 = 192 = 'À'
			const api = new MatApi('192.168.1.1', 2101, '\xC0')
			api.connect()
			await flush()
			tcpHandlers['connect']()
			await flush()

			const [buf] = mockTCP.sendAsync.mock.calls[0] as [Buffer]
			// 0xC0 should appear as [0x7D, 0xE0] in the wire frame
			const innerBytes = Array.from(buf)
			const idx = innerBytes.indexOf(0x7d)
			expect(idx).toBeGreaterThan(0)
			expect(innerBytes[idx + 1]).toBe(0xc0 ^ 0x20) // 0xE0
		})

		it('byte-stuffs 0xC1 in payload', async () => {
			const api = new MatApi('192.168.1.1', 2101, '\xC1')
			api.connect()
			await flush()
			tcpHandlers['connect']()
			await flush()

			const [buf] = mockTCP.sendAsync.mock.calls[0] as [Buffer]
			const innerBytes = Array.from(buf)
			const idx = innerBytes.indexOf(0x7d)
			expect(idx).toBeGreaterThan(0)
			expect(innerBytes[idx + 1]).toBe(0xc1 ^ 0x20) // 0xE1
		})

		it('byte-stuffs 0x7D (ESC) in payload', async () => {
			const api = new MatApi('192.168.1.1', 2101, '\x7D')
			api.connect()
			await flush()
			tcpHandlers['connect']()
			await flush()

			const [buf] = mockTCP.sendAsync.mock.calls[0] as [Buffer]
			const innerBytes = Array.from(buf)
			const idx = innerBytes.indexOf(0x7d)
			expect(idx).toBeGreaterThan(0)
			expect(innerBytes[idx + 1]).toBe(0x7d ^ 0x20) // 0x5D
		})

		it('checksum is XOR of all inner bytes', async () => {
			const api = await createConnectedApi()
			mockTCP.sendAsync.mockClear()
			mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
				tcpHandlers['data'](deviceAck(sentToken(buf), MatCmd.STATUS))
				return true
			})

			await api.queryStatus()
			const [buf] = mockTCP.sendAsync.mock.calls[0] as [Buffer]
			const inner = unstuff(buf)
			const dataBytes = inner.slice(0, inner.length - 1)
			const checksum = inner[inner.length - 1]
			expect(dataBytes.reduce((xor, b) => xor ^ b, 0)).toBe(checksum)
		})

		it('token increments for each command', async () => {
			const api = await createConnectedApi()
			const tokens: number[] = []
			mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
				const token = sentToken(buf)
				tokens.push(token)
				tcpHandlers['data'](deviceAck(token, sentCmd(buf)))
				return true
			})

			await api.queryId()
			await api.querySerial()
			await api.queryAppver()

			expect(tokens).toHaveLength(3)
			expect(tokens[1]).toBe((tokens[0] + 1) % 255)
			expect(tokens[2]).toBe((tokens[1] + 1) % 255)
		})

		it('token wraps at 255 back to 0', async () => {
			const api = await createConnectedApi()
			const tokens: number[] = []
			mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
				const token = sentToken(buf)
				tokens.push(token)
				tcpHandlers['data'](deviceAck(token, sentCmd(buf)))
				return true
			})

			// Send enough commands to guarantee at least one full wrap
			for (let i = 0; i < 255; i++) {
				await api.queryStatus()
			}

			// A single wrap should have occurred (token sequence decreases exactly once)
			let wraps = 0
			for (let i = 1; i < tokens.length; i++) {
				if (tokens[i] < tokens[i - 1]) wraps++
			}
			expect(wraps).toBe(1)
			expect(tokens).toContain(0)
		})
	})

	// ── Connection lifecycle ─────────────────────────────────────────────────

	describe('connection lifecycle', () => {
		it('emits "open" after successful OPEN handshake', async () => {
			const api = new MatApi('192.168.1.1', 2101, '')
			const onOpen = vi.fn()
			api.on('open', onOpen)

			installAutoResponder()
			api.connect()
			await flush()
			tcpHandlers['connect']()
			await flush(500)

			expect(onOpen).toHaveBeenCalledOnce()
		})

		it('emits "close" when TCP end fires', async () => {
			const api = await createConnectedApi()
			const onClose = vi.fn()
			api.on('close', onClose)

			tcpHandlers['end']()
			expect(onClose).toHaveBeenCalledOnce()
		})

		it('emits "close" when disconnect() is called while open', async () => {
			const api = await createConnectedApi()
			const onClose = vi.fn()
			api.on('close', onClose)

			api.disconnect()
			expect(onClose).toHaveBeenCalledOnce()
		})

		it('does not emit "close" when disconnect() is called before connecting', () => {
			const api = new MatApi('192.168.1.1', 2101, '')
			const onClose = vi.fn()
			api.on('close', onClose)

			api.disconnect()
			expect(onClose).not.toHaveBeenCalled()
		})

		it('resets device state on reconnect', async () => {
			const api = await createConnectedApi()

			// Feed an ID so state is non-default
			mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
				tcpHandlers['data'](
					deviceAck(sentToken(buf), MatCmd.ID, [...Buffer.from('MAT288  ')].concat([0x00, 0x01, 0x02])),
				)
				return true
			})
			await api.queryId()
			expect(api.id.model).toBe('MAT288')

			// Reconnect — state should reset
			mockTCP.sendAsync.mockResolvedValue(true)
			api.connect()
			await flush()

			expect(api.id.model).toBe('UNKNOWN')
		})

		it('isOpen is false before OPEN completes', async () => {
			const api = new MatApi('192.168.1.1', 2101, '')
			api.connect()
			await flush()
			tcpHandlers['connect']()
			await flush()

			// OPEN has been sent but not acknowledged yet
			expect(api.isOpen).toBe(false)
		})

		it('isOpen is true after OPEN acknowledged', async () => {
			const api = await createConnectedApi()
			expect(api.isOpen).toBe(true)
		})

		it('isOpen is false after disconnect()', async () => {
			const api = await createConnectedApi()
			api.disconnect()
			expect(api.isOpen).toBe(false)
		})

		it('destroys TCP socket on disconnect()', async () => {
			const api = await createConnectedApi()
			api.disconnect()
			expect(mockTCP.destroy).toHaveBeenCalled()
		})
	})

	// ── queueSend auth guard ─────────────────────────────────────────────────

	describe('command auth guard', () => {
		it('rejects queued commands when session is not open', async () => {
			const api = new MatApi('192.168.1.1', 2101, '')
			await expect(api.queryTemp()).rejects.toThrow('Session not open')
		})

		it('allows no-auth commands before OPEN', async () => {
			const api = new MatApi('192.168.1.1', 2101, '')
			api.connect()
			await flush()
			tcpHandlers['connect']()
			await flush()

			// While OPEN handshake is in flight, queryId should still be accepted
			// (it goes through #queueSendNoAuth)
			mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
				if (sentCmd(buf) === MatCmd.ID) {
					tcpHandlers['data'](
						deviceAck(sentToken(buf), MatCmd.ID, [...Buffer.from('MAT288  ')].concat([0x00, 0x01, 0x01])),
					)
				} else {
					// OPEN
					tcpHandlers['data'](deviceAck(sentToken(buf), MatCmd.OPEN, [0x00]))
				}
				return true
			})

			await expect(api.queryId()).resolves.not.toThrow()
		})
	})

	// ── State parsing ─────────────────────────────────────────────────────────

	describe('state parsing', () => {
		let api: MatApi

		beforeEach(async () => {
			api = await createConnectedApi()
			// Default mock: echo back a response for whatever is sent
			mockTCP.sendAsync.mockImplementation(async (_buf: Buffer) => {
				// Tests override this per-case
				return true
			})
		})

		// ── ID ─────────────────────────────────────────────────────────────

		describe('ID response', () => {
			it('parses model, option, class, and hardware revision', async () => {
				const payload = [
					...Buffer.from('MAT288\0'),
					0x41, // option 'A'
					0x02, // class
					0x03, // hwRev
				]
				respondWith(MatCmd.ID, payload)

				const onId = vi.fn()
				api.on('id', onId)
				await api.queryId()

				expect(api.id.model).toBe('MAT288')
				expect(api.id.option).toBe('A')
				expect(api.id.class).toBe(0x02)
				expect(api.id.hwRev).toBe(0x03)
				expect(onId).toHaveBeenCalledWith(api.id)
			})

			it('trims null bytes from model string', async () => {
				const payload = [...Buffer.from('MAT244\0'), 0x00, 0x01, 0x01]
				respondWith(MatCmd.ID, payload)
				await api.queryId()
				expect(api.id.model).toBe('MAT244')
			})

			it('ignores ID response shorter than 10 bytes', async () => {
				respondWith(MatCmd.ID, [0x01, 0x02])
				await api.queryId()
				expect(api.id.model).toBe('MAT288')
			})
		})

		// ── SERIAL ─────────────────────────────────────────────────────────

		describe('SERIAL response', () => {
			it('parses and trims serial number', async () => {
				const onSerial = vi.fn()
				api.on('serial', onSerial)
				respondWith(MatCmd.SERIAL, [...Buffer.from('U1940157\0\0')])
				await api.querySerial()
				expect(api.serial).toBe('U1940157')
				expect(onSerial).toHaveBeenCalledWith('U1940157')
			})
		})

		// ── APP_VER ─────────────────────────────────────────────────────────

		describe('APPVER response', () => {
			it('parses PRODUCTION_RELEASE version', async () => {
				const api = await createConnectedApi()
				// From protocol doc example: 0xff=production, minor=11, major=1
				const payload = [0xff, 0x0b, 0x01, 0x00, 0x64, 0x26, 0x01, 0x00]
				respondWith(MatCmd.APP_VER, payload)
				await api.queryAppver()

				expect(api.versions.type).toBe(MatVersionType.PRODUCTION_RELEASE)
				expect(api.versions.minor).toBe(11)
				expect(api.versions.major).toBe(1)
				expect(api.versions.muProcessor).toBe(0x01_2664) // little-endian 0x64, 0x26, 0x01
			})

			it('parses RELEASE version', async () => {
				const api = await createConnectedApi()
				const payload = [0x72, 0x05, 0x02, 0x00, 0x01, 0x00, 0x00, 0x00]
				respondWith(MatCmd.APP_VER, payload)
				await api.queryAppver()
				expect(api.versions.type).toBe(MatVersionType.RELEASE)
			})

			it('parses DEBUG version', async () => {
				const api = await createConnectedApi()
				const payload = [0x64, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]
				respondWith(MatCmd.APP_VER, payload)
				await api.queryAppver()
				expect(api.versions.type).toBe(MatVersionType.DEBUG)
			})

			it('emits "versions" event', async () => {
				const api = await createConnectedApi()
				const onVersions = vi.fn()
				api.on('versions', onVersions)
				const payload = [0xff, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]
				respondWith(MatCmd.APP_VER, payload)
				await api.queryAppver()
				expect(onVersions).toHaveBeenCalledOnce()
			})
		})

		// ── NAME ───────────────────────────────────────────────────────────

		describe('NAME response', () => {
			it('updates device name when SRC is Device (0x00)', async () => {
				const onName = vi.fn()
				api.on('name', onName)
				respondWith(MatCmd.NAME, [...Buffer.from('Studio  ')], 0x00)
				await api.setName(MatDst.DEVICE)
				expect(api.name).toBe('Studio')
				expect(onName).toHaveBeenCalledWith('Studio')
			})

			it('updates zone name when SRC is a zone address', async () => {
				const onZone = vi.fn()
				api.on('zone', onZone)
				respondWith(MatCmd.NAME, [...Buffer.from('Stage   ')], 0x01)
				await api.setName(MatDst.ZONE1)
				expect(api.zone(MatDst.ZONE1 as MatDstZones)?.name).toBe('Stage')
				expect(onZone).toHaveBeenCalled()
			})
		})

		// ── DISPLAY ────────────────────────────────────────────────────────

		describe('DISPLAY response', () => {
			it('parses timeout and brightness', async () => {
				const onDisplay = vi.fn()
				api.on('display', onDisplay)
				respondWith(MatCmd.DISPLAY, [0x78, 0x0d])
				await api.setDisplay()

				expect(api.display.timeout).toBe(120)
				expect(api.display.brightness).toBe(13)
				expect(onDisplay).toHaveBeenCalledWith({ timeout: 120, brightness: 13 })
			})

			it('ignores DISPLAY response shorter than 2 bytes', async () => {
				respondWith(MatCmd.DISPLAY, [0x78])
				await api.setDisplay()
				expect(api.display.timeout).toBe(0) // unchanged from default
			})
		})

		// ── LOCK ───────────────────────────────────────────────────────────

		describe('LOCK response', () => {
			it('updates leds.lock and emits "leds"', async () => {
				const onLeds = vi.fn()
				api.on('leds', onLeds)
				respondWith(MatCmd.LOCK, [0x01])
				await api.setLock()

				expect(api.leds.lock).toBe(true)
				expect(onLeds).toHaveBeenCalled()
			})

			it('preserves other led fields when updating lock', async () => {
				// First set some led state via STATUS
				const statusPayload = [0x01, 0x08, 0, 0, 0, 0, 0, 0]
				tcpHandlers['data'](evtFrame(0, MatCmd.STATUS, statusPayload))
				await flush()

				respondWith(MatCmd.LOCK, [0x01])
				await api.setLock()

				expect(api.leds.bootFailed).toBe(true) // preserved from STATUS
				expect(api.leds.lock).toBe(true) // updated by LOCK
			})
		})

		// ── TEMP ───────────────────────────────────────────────────────────

		describe('TEMP response', () => {
			it('parses main, RXA, and RXB temperatures', async () => {
				const onTemp = vi.fn()
				api.on('temp', onTemp)
				// From protocol doc: 0x1b=27°C MAIN, 0x1f=31°C RXA, 0x01=1°C RXB
				respondWith(MatCmd.TEMP, [0x1b, 0x1f, 0x01])
				await api.queryTemp()

				expect(api.temp.main).toBe(27)
				expect(api.temp.rxA).toBe(31)
				expect(api.temp.rxB).toBe(1)
				expect(onTemp).toHaveBeenCalledWith({ main: 27, rxA: 31, rxB: 1 })
			})

			it('handles a 2 byte response from MAT 244, returns RXB temperatures 0', async () => {
				const onTemp = vi.fn()
				api.on('temp', onTemp)
				// From protocol doc: 0x1b=27°C MAIN, 0x1f=31°C RXA
				respondWith(MatCmd.TEMP, [0x1b, 0x1f])
				await api.queryTemp()

				expect(api.temp.main).toBe(27)
				expect(api.temp.rxA).toBe(31)
				expect(api.temp.rxB).toBe(0)
				expect(onTemp).toHaveBeenCalledWith({ main: 27, rxA: 31, rxB: 0 })
			})
		})

		// ── VOLTAGE ────────────────────────────────────────────────────────

		describe('VOLTAGE response', () => {
			it('parses all four voltage rails as UINT16 little-endian', async () => {
				const onVoltage = vi.fn()
				api.on('voltage', onVoltage)
				// ext=1200, _8mv=800, _5mv=500, _12mv=1200 (all as UINT16 LE ×100mV)
				const payload = [
					0xb0,
					0x04, // 0x04B0 = 1200
					0x20,
					0x03, // 0x0320 = 800
					0xf4,
					0x01, // 0x01F4 = 500
					0xb0,
					0x04, // 0x04B0 = 1200
				]
				respondWith(MatCmd.VOLTAGE, payload)
				await api.queryVoltage()

				expect(api.voltage.ext).toBe(1200)
				expect(api.voltage._8mv).toBe(800)
				expect(api.voltage._5mv).toBe(500)
				expect(api.voltage._12mv).toBe(1200)
				expect(onVoltage).toHaveBeenCalled()
			})
		})

		// ── STATUS ─────────────────────────────────────────────────────────

		describe('STATUS response', () => {
			/** Minimal valid STATUS payload — 8 bytes minimum for leds + zone data */
			function statusPayload(
				overrides: Partial<{
					b0: number
					b1: number
					b2: number
					b3: number
					b4: number
					b5: number
					b6: number
					b7: number
					rf: number[]
				}> = {},
			): number[] {
				const {
					b0 = 0,
					b1 = 0,
					b2 = 0,
					b3 = 0,
					b4 = 0,
					b5 = 0,
					b6 = 0,
					b7 = 0,
					rf = [0, 0, 0, 0, 0, 0, 0, 0],
				} = overrides
				return [b0, b1, b2, b3, b4, b5, b6, b7, ...rf]
			}

			it('parses B0 state LED bits correctly', async () => {
				// B0 bits: 0=bootFailed, 1=lock, 3=events, 4=errors
				const payload = statusPayload({ b0: 0b00011011 })
				tcpHandlers['data'](evtFrame(0, MatCmd.STATUS, payload))
				await flush()

				expect(api.leds.bootFailed).toBe(true) // bit 0
				expect(api.leds.lock).toBe(true) // bit 1
				expect(api.leds.events).toBe(true) // bit 3
				expect(api.leds.errors).toBe(true) // bit 4
				expect(api.leds.fan1).toBe(false)
			})

			it('parses B1 status LED bits correctly', async () => {
				// B1 bits: 0=fan1, 1=fan2, 2=overTemp, 3=ac, 4=dc, 6=alarm
				const payload = statusPayload({ b1: 0b01011111 })
				tcpHandlers['data'](evtFrame(0, MatCmd.STATUS, payload))
				await flush()

				expect(api.leds.fan1).toBe(true)
				expect(api.leds.fan2).toBe(true)
				expect(api.leds.overTemp).toBe(true)
				expect(api.leds.ac).toBe(true)
				expect(api.leds.dc).toBe(true)
				expect(api.leds.alarm).toBe(true)
			})

			it('parses pending events for zones 1–4 from B2', async () => {
				// Zone 1 events = bit 0, Zone 1 errors = bit 1
				// Zone 2 events = bit 2, Zone 2 errors = bit 3
				const payload = statusPayload({ b2: 0b00000101 }) // zones 1 and 2 have events
				// Suppress clearPendingEvent side effects
				mockTCP.sendAsync.mockResolvedValue(true)
				tcpHandlers['data'](evtFrame(0, MatCmd.STATUS, payload))
				await flush()

				expect(api.zone(MatDst.ZONE1 as MatDstZones)?.leds.pendingEvents).toBe(true)
				expect(api.zone(MatDst.ZONE1 as MatDstZones)?.leds.pendingErrors).toBe(false)
				expect(api.zone(MatDst.ZONE2 as MatDstZones)?.leds.pendingEvents).toBe(true)
			})

			it('parses pending events for zones 5–8 from B3', async () => {
				const payload = statusPayload({ b3: 0b00000001 }) // zone 5 has events
				mockTCP.sendAsync.mockResolvedValue(true)
				tcpHandlers['data'](evtFrame(0, MatCmd.STATUS, payload))
				await flush()

				expect(api.zone(MatDst.ZONE5 as MatDstZones)?.leds.pendingEvents).toBe(true)
				expect(api.zone(MatDst.ZONE6 as MatDstZones)?.leds.pendingEvents).toBe(false)
			})

			it('parses alarm boost for MAT288 — both A and B active', async () => {
				// B4 bit 0 = zone 1 alarm A, bit 1 = zone 1 alarm B
				const payload = statusPayload({ b4: 0b00000011 })
				tcpHandlers['data'](evtFrame(0, MatCmd.STATUS, payload))
				await flush()

				expect(api.zone(MatDst.ZONE1 as MatDstZones)?.leds.alarmBoost).toBe(AntennaAlarmLed.ERROR)
			})

			it('parses alarm boost for MAT244 — B bits masked out', async () => {
				mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
					tcpHandlers['data'](
						buildFrame(0x00, 0xfe, sentToken(buf), CMD_ACK_OK, MatCmd.ID, [
							...Buffer.from('MAT244\0'),
							0x00,
							0x01,
							0x01,
						]),
					)
					return true
				})
				await api.queryId()

				const payload = statusPayload({ b4: 0b00000010 })
				tcpHandlers['data'](evtFrame(0, MatCmd.STATUS, payload))
				await flush()

				expect(api.zone(MatDst.ZONE1 as MatDstZones)?.leds.alarmBoost).toBe(AntennaAlarmLed.OFF)
			})

			it('parses zone LED colours from B6 and B7', async () => {
				// B6: Zone1=bits[1:0], Zone2=bits[3:2], Zone3=bits[5:4], Zone4=bits[7:6]
				// 0b10_01_11_10 = Zone4=2(green), Zone3=3(blue), Zone2=1(red), Zone1=2(green)
				const payload = statusPayload({ b6: 0b10110110 })
				tcpHandlers['data'](evtFrame(0, MatCmd.STATUS, payload))
				await flush()

				expect(api.zone(MatDst.ZONE1 as MatDstZones)?.leds.zone).toBe(AntennaZoneColors.GREEN)
				expect(api.zone(MatDst.ZONE2 as MatDstZones)?.leds.zone).toBe(AntennaZoneColors.RED)
				expect(api.zone(MatDst.ZONE3 as MatDstZones)?.leds.zone).toBe(AntennaZoneColors.BLUE)
				expect(api.zone(MatDst.ZONE4 as MatDstZones)?.leds.zone).toBe(AntennaZoneColors.GREEN)
			})

			it('parses RF levels as signed INT16 little-endian ÷100 dB', async () => {
				const onRf = vi.fn()
				api.on('rfLevels', onRf)
				// -20.78 dB = -2078 = 0xF7E2 little-endian → [0xE2, 0xF7]
				// -46.19 dB = -4619 = 0xEDF5 little-endian → [0xF5, 0xED]
				const rf = [0xe2, 0xf7, 0xf5, 0xed, 0xe2, 0xf7, 0xf5, 0xed]
				const payload = statusPayload({ rf })
				tcpHandlers['data'](evtFrame(0, MatCmd.STATUS, payload))
				await flush()

				expect(api.rfLevels.a1).toBe(-2078)
				expect(api.rfLevels.b1).toBe(-4619)
				expect(onRf).toHaveBeenCalled()
			})

			it('does not update RF levels when payload is shorter than 16 bytes', async () => {
				// Only 8 bytes — no RF data
				tcpHandlers['data'](deviceAck(0, MatCmd.STATUS, [0, 0, 0, 0, 0, 0, 0, 0]))
				await flush()
				expect(api.rfLevels.a1).toBe(0) // unchanged default
			})

			it('calls clearPendingEvent when pending events detected', async () => {
				const clearCalls: number[] = []
				mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
					if (sentCmd(buf) === MatCmd.CLEAR) {
						clearCalls.push(sentToken(buf))
					}
					// Respond to CLEAR so the queue doesn't block
					tcpHandlers['data'](zoneAck(1, sentToken(buf), MatCmd.CLEAR))
					return true
				})

				// Zone 1 has pending events (B2 bit 0)
				tcpHandlers['data'](evtFrame(0, MatCmd.STATUS, statusPayload({ b2: 0b00000001 })))
				await flush()

				expect(clearCalls.length).toBeGreaterThan(0)
			})

			it('emits "leds" and "zone" events', async () => {
				const onLeds = vi.fn()
				const onZone = vi.fn()
				api.on('leds', onLeds)
				api.on('zone', onZone)

				tcpHandlers['data'](evtFrame(0, MatCmd.STATUS, statusPayload()))
				await flush()

				expect(onLeds).toHaveBeenCalledOnce()
				expect(onZone).toHaveBeenCalledTimes(8) // one per zone
			})
		})

		// ── ANTENNA ────────────────────────────────────────────────────────

		describe('ANTENNA response', () => {
			it('updates matrixConfig from MATRIX sub-command', async () => {
				const onMatrix = vi.fn()
				api.on('matrixConfig', onMatrix)
				respondWith(MatCmd.ANTENNA, [0x00, 0x01], 0x00)
				await api.setAntennaMatrix()
				expect(api.matrixConfig).toBe(AntennaMatrixChoices.Matrix8_4Driver)
				expect(onMatrix).toHaveBeenCalledWith(AntennaMatrixChoices.Matrix8_4Driver)
			})

			it('updates zone active from ACTIVATE sub-command', async () => {
				const zoneId = MatDst.ZONE2 as MatDstZones
				respondWith(MatCmd.ANTENNA, [0x01, 0x01], zoneId)
				await api.setAntennaActivate(zoneId)
				expect(api.zone(zoneId)?.active).toBe(true)
			})

			it('updates zone diversity from DIVERSITY sub-command', async () => {
				const zoneId = MatDst.ZONE1 as MatDstZones
				respondWith(MatCmd.ANTENNA, [0x02, 0x00], zoneId)
				await api.setAntennaDiversity(zoneId)
				expect(api.zone(zoneId)?.diversity).toBe(AntennaDiversityChoices.A)
			})

			it('updates zone boost from BOOST sub-command', async () => {
				const zoneId = MatDst.ZONE3 as MatDstZones
				respondWith(MatCmd.ANTENNA, [0x03, 0x07], zoneId)
				await api.setAntennaBoost(zoneId)
				expect(api.zone(zoneId)?.boost).toBe(AntennaBoostChoices.AH)
			})

			it('updates antenna A gain from GAIN sub-command', async () => {
				const zoneId = MatDst.ZONE1 as MatDstZones
				respondWith(MatCmd.ANTENNA, [0x04, 0x00, 0x0a], zoneId)
				await api.setAntennaGain(zoneId)
				expect(api.zone(zoneId)?.antenna.A.gain).toBe(10)
			})

			it('updates antenna B gain from GAIN sub-command', async () => {
				const zoneId = MatDst.ZONE1 as MatDstZones
				respondWith(MatCmd.ANTENNA, [0x04, 0x01, 0x14], zoneId)
				await api.setAntennaGain(zoneId)
				expect(api.zone(zoneId)?.antenna.B.gain).toBe(20)
			})

			it('parses BOOST_DIAG voltage and current as UINT16 LE', async () => {
				const zoneId = MatDst.ZONE1 as MatDstZones
				respondWith(MatCmd.ANTENNA, [0x06, 0xef, 0x2f, 0x57, 0x00, 0xff, 0xff, 0xff, 0xff], zoneId)
				await api.queryAntennaBoostDiag(zoneId)
				const zone = api.zone(zoneId)
				expect(zone?.antenna.A.voltage).toBe(12271)
				expect(zone?.antenna.A.current).toBe(87)
				expect(zone?.antenna.B.voltage).toBeNull()
				expect(zone?.antenna.B.current).toBeNull()
			})

			it('maps BOOST_DIAG 0xFFFF to null for absent B-path sensor', async () => {
				const zoneId = MatDst.ZONE1 as MatDstZones
				respondWith(MatCmd.ANTENNA, [0x06, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff], zoneId)
				await api.queryAntennaBoostDiag(zoneId)
				const zone = api.zone(zoneId)
				expect(zone?.antenna.B.voltage).toBeNull()
				expect(zone?.antenna.B.current).toBeNull()
			})

			it('emits "zone" after antenna sub-command response', async () => {
				const onZone = vi.fn()
				api.on('zone', onZone)
				const zoneId = MatDst.ZONE1 as MatDstZones
				respondWith(MatCmd.ANTENNA, [0x01, 0x01], zoneId)
				await api.setAntennaActivate(zoneId)
				expect(onZone).toHaveBeenCalled()
			})
		})
	})

	// ── AUTOSTATUS (EVT) ──────────────────────────────────────────────────────

	describe('AUTOSTATUS EVT routing', () => {
		it('routes EVT STATUS frames through the same state updater as CMD_ACK', async () => {
			const api = await createConnectedApi()
			const onLeds = vi.fn()
			api.on('leds', onLeds)

			// Feed an unsolicited EVT STATUS frame (as sent by AUTOSTATUS)
			const payload = [0x08, 0x00, 0, 0, 0, 0, 0, 0] // B0=0x08 → events=true
			tcpHandlers['data'](evtFrame(0xff, MatCmd.STATUS, payload))
			await flush()

			expect(api.leds.events).toBe(true)
			expect(onLeds).toHaveBeenCalled()
		})

		it('does not reject or timeout on EVT frames', async () => {
			await createConnectedApi()
			// Feed an EVT with a token that has no pending command
			expect(() => {
				tcpHandlers['data'](evtFrame(0x42, MatCmd.STATUS, [0, 0, 0, 0, 0, 0, 0, 0]))
			}).not.toThrow()
		})
	})

	// ── Error handling ────────────────────────────────────────────────────────

	describe('error handling', () => {
		let api: MatApi

		beforeEach(async () => {
			api = await createConnectedApi()
		})

		it('rejects the command promise on response timeout', async () => {
			// Do not feed a response — let the timeout fire
			mockTCP.sendAsync.mockResolvedValue(true)

			const promise = api.queryId()
			// Advance past the RESPONSE_TIMEOUT_MS (2000ms)
			vi.advanceTimersByTime(2001)

			await expect(promise).rejects.toThrow('Response timeout')
		})

		it('rejects when sendAsync returns false', async () => {
			mockTCP.sendAsync.mockResolvedValue(false)
			await expect(api.queryId()).rejects.toThrow('Send failed')
		})

		it('rejects when sendAsync throws', async () => {
			mockTCP.sendAsync.mockRejectedValue(new Error('Network error'))
			await expect(api.queryId()).rejects.toThrow('Network error')
		})

		it('rejects with error status in response', async () => {
			// Status 0x08 = INVALID_PARAM
			mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
				tcpHandlers['data'](errorAck(sentToken(buf), MatCmd.ID, 0x08))
				return true
			})
			await expect(api.queryId()).rejects.toThrow('failed')
		})

		it('rejects all pending commands on TCP end', async () => {
			// Park two commands without responses
			mockTCP.sendAsync.mockResolvedValue(true)
			const p1 = api.queryId()
			const p2 = api.querySerial()

			tcpHandlers['end']()

			await expect(p1).rejects.toThrow('Connection closed')
			await expect(p2).rejects.toThrow('Connection closed')
		})

		it('rejects all pending commands on disconnect()', async () => {
			mockTCP.sendAsync.mockResolvedValue(true)
			const pending = api.queryId()
			api.disconnect()
			await expect(pending).rejects.toThrow('Disconnected')
		})

		it('logs warn and ignores frames shorter than 7 bytes after unstuffing', async () => {
			// A frame with only BOF and EOF — inner would be empty
			const shortFrame = Buffer.from([BOF, 0x00, 0xfe, EOF])
			expect(() => tcpHandlers['data'](shortFrame)).not.toThrow()
		})

		it('logs warn on checksum mismatch but still processes the frame', async () => {
			const api2 = await createConnectedApi()
			const onId = vi.fn()
			api2.on('id', onId)

			mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
				const valid = buildFrame(0x00, 0xfe, sentToken(buf), CMD_ACK_OK, MatCmd.ID, [
					...Buffer.from('MAT288\0'),
					0x00,
					0x01,
					0x01,
				])
				const corrupted = Buffer.from(valid)
				corrupted[corrupted.length - 2] ^= 0xff
				tcpHandlers['data'](corrupted)
				return true
			})
			await api2.queryId()

			expect(onId).toHaveBeenCalled()
		})

		it('logs warn and ignores response with no matching pending token', async () => {
			// Feed a response with a token that was never sent
			expect(() => {
				tcpHandlers['data'](deviceAck(0xab, MatCmd.ID, [...Buffer.from('MAT288\0'), 0x00, 0x01, 0x01]))
			}).not.toThrow()
		})
	})

	// ── Edge cases ────────────────────────────────────────────────────────────

	describe('edge cases', () => {
		let api: MatApi

		beforeEach(async () => {
			api = await createConnectedApi()
		})

		it('handles multiple complete frames in a single data chunk', async () => {
			const onLeds = vi.fn()
			api.on('leds', onLeds)

			const frame1 = evtFrame(0, MatCmd.STATUS, [0x01, 0, 0, 0, 0, 0, 0, 0])
			const frame2 = evtFrame(0, MatCmd.STATUS, [0x02, 0, 0, 0, 0, 0, 0, 0])
			const combined = Buffer.concat([frame1, frame2])

			tcpHandlers['data'](combined)
			await flush()

			// Both frames should be parsed
			expect(onLeds).toHaveBeenCalledTimes(2)
		})

		it('handles a frame split across two data chunks', async () => {
			const onId = vi.fn()
			api.on('id', onId)

			mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
				const frame = deviceAck(sentToken(buf), MatCmd.ID, [...Buffer.from('MAT288\0'), 0x00, 0x01, 0x01])
				// Split at byte 5
				tcpHandlers['data'](frame.slice(0, 5))
				tcpHandlers['data'](frame.slice(5))
				return true
			})

			await api.queryId()
			expect(onId).toHaveBeenCalledOnce()
			expect(api.id.model).toBe('MAT288')
		})

		it('discards garbage bytes before BOF', async () => {
			const onId = vi.fn()
			api.on('id', onId)

			mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
				const validFrame = deviceAck(sentToken(buf), MatCmd.ID, [...Buffer.from('MAT288\0'), 0x00, 0x01, 0x01])
				// Prepend garbage
				const withGarbage = Buffer.concat([Buffer.from([0xaa, 0xbb, 0xcc]), validFrame])
				tcpHandlers['data'](withGarbage)
				return true
			})

			await api.queryId()
			expect(onId).toHaveBeenCalledOnce()
			expect(api.id.model).toBe('MAT288')
		})

		it('correctly reverses byte stuffing in received frames', async () => {
			const onId = vi.fn()
			api.on('id', onId)

			mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
				const rawPayload = [0xc0, 0xc1, 0x7d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
				tcpHandlers['data'](buildFrame(0x00, 0xfe, sentToken(buf), CMD_ACK_OK, MatCmd.ID, rawPayload))
				return true
			})
			await api.queryId()

			expect(onId).toHaveBeenCalledOnce()
		})

		it('all zones are populated after initial refresh', () => {
			for (let z = 1; z <= 8; z++) {
				expect(api.zone(z)).toBeDefined()
			}
		})

		it('zone() returns state after first response for that zone', async () => {
			const zoneId = MatDst.ZONE4 as MatDstZones
			mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
				tcpHandlers['data'](buildFrame(zoneId, 0xfe, sentToken(buf), CMD_ACK_OK, MatCmd.ANTENNA, [0x01, 0x01]))
				return true
			})
			await api.setAntennaActivate(zoneId)
			expect(api.zone(zoneId)).toBeDefined()
			expect(api.zone(zoneId)?.active).toBe(true)
		})

		it('attenuation is clamped to 0–63 in setAntennaGain', async () => {
			const zoneId = MatDst.ZONE1 as MatDstZones
			const sentPayloads: number[][] = []

			mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
				sentPayloads.push(sentPayload(buf))
				tcpHandlers['data'](buildFrame(zoneId, 0xfe, sentToken(buf), CMD_ACK_OK, MatCmd.ANTENNA, [0x04, 0x00, 0x00]))
				return true
			})

			await api.setAntennaGain(zoneId, { selection: AntennaDiversityChoices.A, attenuation: 999 })
			// payload: [subCmd=0x04, selection=0x00, attenuation=63 (clamped)]
			expect(sentPayloads[0][2]).toBe(63)

			await api.setAntennaGain(zoneId, { selection: AntennaDiversityChoices.A, attenuation: -5 })
			expect(sentPayloads[1][2]).toBe(0)
		})

		it('display options are clamped to 0–255', async () => {
			const sentPayloads: number[][] = []
			mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
				sentPayloads.push(sentPayload(buf))
				tcpHandlers['data'](deviceAck(sentToken(buf), MatCmd.DISPLAY, [0xff, 0xff]))
				return true
			})

			await api.setDisplay({ timeout: 9999, brightness: -1 })
			expect(sentPayloads[0][0]).toBe(255) // clamped timeout
			expect(sentPayloads[0][1]).toBe(0) // clamped brightness
		})

		it('setName truncates to 8 characters', async () => {
			const sentPayloads: number[][] = []
			mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
				sentPayloads.push(sentPayload(buf))
				tcpHandlers['data'](deviceAck(sentToken(buf), MatCmd.NAME, [...Buffer.from('12345678')]))
				return true
			})

			await api.setName(MatDst.DEVICE, 'TooLongNameString')
			// payload should be at most 8 bytes
			expect(sentPayloads[0].length).toBeLessThanOrEqual(8)
		})

		it('setMessage truncates to 40 characters', async () => {
			const sentPayloads: number[][] = []
			mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
				sentPayloads.push(sentPayload(buf))
				tcpHandlers['data'](deviceAck(sentToken(buf), MatCmd.MESSAGE))
				return true
			})

			const longMsg = 'A'.repeat(100)
			await api.setMessage({ blink: false, message: longMsg })
			// payload: [blink=0x00, ...msg chars] — msg portion capped at 40
			expect(sentPayloads[0].length).toBeLessThanOrEqual(41)
		})

		it('setAutostatus clamps interval to minimum 20ms', async () => {
			const sentPayloads: number[][] = []
			mockTCP.sendAsync.mockImplementation(async (buf: Buffer) => {
				sentPayloads.push(sentPayload(buf))
				tcpHandlers['data'](deviceAck(sentToken(buf), MatCmd.AUTO_STATUS))
				return true
			})

			await api.setAutostatus(true, 5) // 5ms — should clamp to 20ms
			// payload: [enable=0x01, interval_lo, interval_hi]
			const interval = sentPayloads[0][1] | (sentPayloads[0][2] << 8)
			expect(interval).toBe(20)
		})
	})
})
