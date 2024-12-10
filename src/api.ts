import {
	MatCmd,
	MatBofEof,
	MatSrc,
	MatDst,
	MatDstZones,
	MatMsgType,
	MatMsgStatus,
	MatMessage,
	SubCmdAntenna,
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
		case Number(MatBofEof.BOF):
		case Number(MatBofEof.EOF):
		case Number(MatBofEof.ESC):
			return [0x7d, byte ^ 0x20]
		default:
			return [byte]
	}
}

export function buildMessage(msg: MatMessage): Buffer {
	const msgTypeStatus = (msg.type << 6) + msg.status
	let payload: number[] = [msg.cmd]
	if (msg.subCmd) payload.push(msg.subCmd)
	payload = [...payload, ...msg.payload]
	payload
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
	let message = [MatBofEof.BOF, msg.src, msg.dst, msg.token, payload.length, msgTypeStatus, ...payload]
	const checksum = calcChecksum(message)
	message = [...message, checksum, MatBofEof.EOF]
	return Buffer.from(message)
}

export class MatApi {
	#token: Token = new Token(0)
	public messages: Map<number, MatMessage> = new Map<number, MatMessage>()
	constructor() {}

	private getMessage(msg: {
		src?: MatSrc
		dst?: MatDst
		token?: number
		type?: MatMsgType
		status?: MatMsgStatus
		cmd: MatCmd
		subCmd?: SubCmdAntenna
		payload?: number[]
	}): MatMessage {
		const message: MatMessage = {
			src: msg.src ?? MatSrc.PC,
			dst: msg.dst ?? MatDst.DEVICE,
			token: msg.token ?? this.#token.newToken,
			type: msg.type ?? MatMsgType.CMD,
			status: msg.status ?? MatMsgStatus.OK,
			cmd: msg.cmd,
			payload: msg.payload ?? [],
		}
		if (msg.subCmd) message.subCmd = msg.subCmd
		this.messages.set(message.token, message)
		return message
	}

	public open(password: string = ''): Buffer {
		const payload: number[] = []
		const pwdLength = password.length
		for (let i = 0; i < pwdLength; i++) {
			payload.push(password.charCodeAt(i))
		}
		const msg = this.getMessage({ cmd: MatCmd.OPEN, payload: payload })
		return buildMessage(msg)
	}

	public close(): Buffer {
		const msg = this.getMessage({ cmd: MatCmd.CLOSE })
		return buildMessage(msg)
	}

	public id(): Buffer {
		const msg = this.getMessage({ cmd: MatCmd.ID })
		return buildMessage(msg)
	}

	public serial(): Buffer {
		const msg = this.getMessage({ cmd: MatCmd.SERIAL })
		return buildMessage(msg)
	}

	public appver(): Buffer {
		const msg = this.getMessage({ cmd: MatCmd.APP_VER })
		return buildMessage(msg)
	}

	public name(zone: Exclude<MatDst, MatDst.PC>, name?: string): Buffer {
		const payload: number[] = []
		if (name) {
			const cleanName = name.trim().substring(0, 8)
			const nameLength = cleanName.length
			for (let i = 0; i < nameLength; i++) {
				payload.push(cleanName.charCodeAt(i))
			}
		}
		const msg = this.getMessage({ dst: zone, cmd: MatCmd.NAME, payload: payload })
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
		const msg = this.getMessage({ cmd: MatCmd.DISPLAY, payload: payload })
		return buildMessage(msg)
	}

	public lock(options?: { lock: boolean }): Buffer {
		const payload: number[] = []
		if (options) {
			payload.push(Number(options.lock))
		}
		const msg = this.getMessage({ cmd: MatCmd.LOCK, payload: payload })
		return buildMessage(msg)
	}
	public message(options?: { blink: boolean; message?: string }): Buffer {
		const payload: number[] = []
		if (options) {
			payload.push(Number(options.blink))
			if (options.message) {
				const cleanMsg = options.message.trim().substring(0, 40)
				const msgLength = cleanMsg.length
				for (let i = 0; i < msgLength; i++) {
					payload.push(cleanMsg.charCodeAt(i))
				}
			}
		}
		const msg = this.getMessage({ cmd: MatCmd.MESSAGE, payload: payload })
		return buildMessage(msg)
	}

	public temp(): Buffer {
		const msg = this.getMessage({ cmd: MatCmd.TEMP })
		return buildMessage(msg)
	}

	public voltage(): Buffer {
		const msg = this.getMessage({ cmd: MatCmd.VOLTAGE })
		return buildMessage(msg)
	}

	public saveParam(): Buffer {
		const msg = this.getMessage({ cmd: MatCmd.SAVE_PAR })
		return buildMessage(msg)
	}

	public status(): Buffer {
		const msg = this.getMessage({ cmd: MatCmd.STATUS })
		return buildMessage(msg)
	}

	public autostatus(interval: number = 32): Buffer {
		const payload: number[] = []
		let data = interval < 20 ? 20 : Math.round(interval)
		const byte1 = data & 255
		data >>= 8
		payload.push(byte1)
		payload.push(data)
		const msg = this.getMessage({ cmd: MatCmd.AUTO_STATUS, payload: payload })
		return buildMessage(msg)
	}

	public antennaMatrix(options?: { selection: AntennaMatrixChoices }): Buffer {
		const payload: number[] = []
		if (options) {
			payload.push(options.selection)
		}
		const msg = this.getMessage({ cmd: MatCmd.ANTENNA, subCmd: SubCmdAntenna.MATRIX, payload: payload })
		return buildMessage(msg)
	}

	public antennaActivate(zone: MatDstZones, options?: { activation: MatBooleanChoices }): Buffer {
		const payload: number[] = []
		if (options) {
			payload.push(options.activation)
		}
		const msg = this.getMessage({ cmd: MatCmd.ANTENNA, subCmd: SubCmdAntenna.ACTIVATE, dst: zone, payload: payload })
		return buildMessage(msg)
	}

	public antennaDiversity(zone: MatDstZones, options?: { diversity: AntennaDiversityChoices }): Buffer {
		const payload: number[] = []
		if (options) {
			payload.push(options.diversity)
		}
		const msg = this.getMessage({ cmd: MatCmd.ANTENNA, subCmd: SubCmdAntenna.DIVERSITY, dst: zone, payload: payload })
		return buildMessage(msg)
	}

	public antennaBoost(zone: MatDstZones, options?: { boost: AntennaBoostChoices }): Buffer {
		const payload: number[] = []
		if (options) {
			payload.push(options.boost)
		}
		const msg = this.getMessage({ cmd: MatCmd.ANTENNA, subCmd: SubCmdAntenna.BOOST, dst: zone, payload: payload })
		return buildMessage(msg)
	}

	public antennaGain(zone: MatDstZones, options?: { selection: AntennaDiversityChoices; attenuation: number }): Buffer {
		const payload: number[] = []
		if (options) {
			payload.push(options.selection)
			const atten = options.attenuation > 63 ? 63 : options.attenuation < 0 ? 0 : Math.round(options.attenuation)
			payload.push(atten)
		}
		const msg = this.getMessage({ cmd: MatCmd.ANTENNA, subCmd: SubCmdAntenna.GAIN, dst: zone, payload: payload })
		return buildMessage(msg)
	}
}
