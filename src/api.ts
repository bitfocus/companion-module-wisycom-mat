import {
	matCmd,
	matBofEof,
	matSrc,
	matDst,
	matDstZones,
	matMsgType,
	matMsgStatus,
	matMessage,
	subCmdAntenna,
	AntennaMatrixChoices,
	MatBooleanChoices,
	AntennaDiversityChoices,
	AntennaBoostChoices,
} from './enum.js'
import { Token } from './token.js'

function calcChecksum(msg: number[]): number {
	let checksum = 0
	for (let i = 0; i < msg.length; i++) {
		checksum ^= msg[i]
	}
	return checksum
}

function byteStuffing(byte: number): number[] {
	switch (byte) {
		case Number(matBofEof.BOF):
		case Number(matBofEof.EOF):
		case Number(matBofEof.ESC):
			return [0x7d, byte ^ 0x20]
		default:
			return [byte]
	}
}

export function buildMessage(msg: matMessage): Buffer {
	const msgTypeStatus = (msg.type << 6) + msg.status
	const payload = [msg.cmd, ...msg.payload]
		.map((dataVal) => {
			let data = dataVal
			let stuffedBytes: number[] = []
			while (data > 0) {
				const byte = data & 255
				data >>= 8
				stuffedBytes = [...stuffedBytes, ...byteStuffing(byte)]
			}
			return stuffedBytes
		})
		.flat()
	let message = [matBofEof.BOF, msg.src, msg.dst, msg.token, payload.length, msgTypeStatus, ...payload]
	const checksum = calcChecksum(message)
	message = [...message, checksum, matBofEof.EOF]
	return Buffer.from(message)
}

export class MatApi {
	#token: Token = new Token(0)
	public messages: Map<number, matMessage> = new Map<number, matMessage>()
	constructor() {}

	private getMessage(msg: {
		src?: matSrc
		dst?: matDst
		token?: number
		type?: matMsgType
		status?: matMsgStatus
		cmd: matCmd
		payload?: number[]
	}): matMessage {
		return {
			src: msg.src ?? matSrc.PC,
			dst: msg.dst ?? matDst.DEVICE,
			token: msg.token ?? this.#token.newToken,
			type: msg.type ?? matMsgType.CMD,
			status: msg.status ?? matMsgStatus.OK,
			cmd: msg.cmd,
			payload: msg.payload ?? [],
		}
	}

	public open(password: string = ''): Buffer {
		const payload: number[] = []
		for (let i = 0; i < password.length; i++) {
			payload.push(password.charCodeAt(i))
		}
		const msg = this.getMessage({ cmd: matCmd.OPEN, payload: payload })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}

	public close(): Buffer {
		const msg = this.getMessage({ cmd: matCmd.CLOSE })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}

	public id(): Buffer {
		const msg = this.getMessage({ cmd: matCmd.ID })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}

	public serial(): Buffer {
		const msg = this.getMessage({ cmd: matCmd.SERIAL })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}

	public appver(): Buffer {
		const msg = this.getMessage({ cmd: matCmd.APP_VER })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}

	public name(zone: Exclude<matDst, matDst.PC>, name?: string): Buffer {
		const payload: number[] = []
		if (name) {
			const cleanName = name.trim().substring(0, 8)
			for (let i = 0; i < cleanName.length; i++) {
				payload.push(cleanName.charCodeAt(i))
			}
		}
		const msg = this.getMessage({ dst: zone, cmd: matCmd.NAME, payload: payload })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}

	public display(options?: { timeout: number; brightness: number }): Buffer {
		const payload: number[] = []
		if (options) {
			const tOut = options.timeout > 255 ? 255 : options.timeout < 0 ? 0 : Math.round(options.timeout)
			const bright = options.brightness > 255 ? 255 : options.brightness < 0 ? 0 : Math.round(options.brightness)
			payload.push(tOut)
			payload.push(bright)
		}
		const msg = this.getMessage({ cmd: matCmd.DISPLAY, payload: payload })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}

	public lock(options?: { lock: boolean }): Buffer {
		const payload: number[] = []
		if (options) {
			payload.push(Number(options.lock))
		}
		const msg = this.getMessage({ cmd: matCmd.LOCK, payload: payload })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}
	public message(options?: { blink: boolean; message?: string }): Buffer {
		const payload: number[] = []
		if (options) {
			payload.push(Number(options.blink))
			if (options.message) {
				const cleanMsg = options.message.trim().substring(0, 40)
				for (let i = 0; i < cleanMsg.length; i++) {
					payload.push(cleanMsg.charCodeAt(i))
				}
			}
		}
		const msg = this.getMessage({ cmd: matCmd.MESSAGE, payload: payload })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}

	public temp(): Buffer {
		const msg = this.getMessage({ cmd: matCmd.TEMP })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}

	public voltage(): Buffer {
		const msg = this.getMessage({ cmd: matCmd.VOLTAGE })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}

	public saveParam(): Buffer {
		const msg = this.getMessage({ cmd: matCmd.SAVE_PAR })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}

	public status(): Buffer {
		const msg = this.getMessage({ cmd: matCmd.STATUS })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}

	public autostatus(interval: number = 32): Buffer {
		const payload: number[] = []
		let data = interval < 20 ? 20 : Math.round(interval)
		const byte1 = data & 255
		data >>= 8
		payload.push(byte1)
		payload.push(data)
		const msg = this.getMessage({ cmd: matCmd.AUTO_STATUS, payload: payload })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}

	public antennaMatrix(options?: { selection: AntennaMatrixChoices }): Buffer {
		const payload: number[] = [subCmdAntenna.MATRIX]
		if (options) {
			payload.push(options.selection)
		}
		const msg = this.getMessage({ cmd: matCmd.ANTENNA, payload: payload })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}

	public antennaActivate(zone: matDstZones, options?: { activation: MatBooleanChoices }): Buffer {
		const payload: number[] = [subCmdAntenna.ACTIVATE]
		if (options) {
			payload.push(options.activation)
		}
		const msg = this.getMessage({ cmd: matCmd.ANTENNA, dst: zone, payload: payload })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}

	public antennaDiversity(zone: matDstZones, options?: { diversity: AntennaDiversityChoices }): Buffer {
		const payload: number[] = [subCmdAntenna.DIVERSITY]
		if (options) {
			payload.push(options.diversity)
		}
		const msg = this.getMessage({ cmd: matCmd.ANTENNA, dst: zone, payload: payload })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}

	public antennaBoost(zone: matDstZones, options?: { boost: AntennaBoostChoices }): Buffer {
		const payload: number[] = [subCmdAntenna.BOOST]
		if (options) {
			payload.push(options.boost)
		}
		const msg = this.getMessage({ cmd: matCmd.ANTENNA, dst: zone, payload: payload })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}

	public antennaGain(zone: matDstZones, options?: { selection: AntennaDiversityChoices; attenuation: number }): Buffer {
		const payload: number[] = [subCmdAntenna.GAIN]
		if (options) {
			payload.push(options.selection)
			const atten = options.attenuation > 63 ? 63 : options.attenuation < 0 ? 0 : Math.round(options.attenuation)
			payload.push(atten)
		}
		const msg = this.getMessage({ cmd: matCmd.ANTENNA, dst: zone, payload: payload })
		this.messages.set(msg.token, msg)
		return buildMessage(msg)
	}
}
