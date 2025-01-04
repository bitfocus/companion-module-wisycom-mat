import {
	MatCmd,
	MatBofEof,
	MatSrc,
	MatDst,
	MatDstZones,
	MatMsgType,
	MatMsgStatus,
	SubCmdAntenna,
	AntennaMatrixChoices,
	MatBooleanChoices,
	AntennaDiversityChoices,
	AntennaBoostChoices,
} from './enum.js'
import { MatDevice } from './device.js'
import { Token } from './token.js'
import { type Logger, LoggerLevel } from './logger.js'

/**
 * Object containing all data elements to required to build a message buffer
 */

interface MatMessage {
	src: MatSrc
	dst: MatDst
	token: number
	type: MatMsgType
	status: MatMsgStatus
	cmd: MatCmd
	subCmd?: SubCmdAntenna
	payload: number[]
}

/**
 * Calculate checksum, XOR of all prior byes
 * @param msg array of message values (effectively uint8)
 * @returns checksum byte value
 */

function calcChecksum(msg: number[]): number {
	let checksum = 0
	const length = msg.length
	// start at 1 to skip BOF
	for (let i = 1; i < length; i++) {
		checksum ^= msg[i]
	}
	return checksum
}

/**
 * Stuff bytes that match BOF, EOF, ESC
 * @param byte byte value to be stuffed
 * @returns array stuffed values, 1 or 2 bytes
 */

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

/**
 * Convert message data into buffer ready to be TX'd
 * @param msg MatMessage object to be converted into buffer
 * @returns buffer ready to be sent
 */

function buildMessage(msg: MatMessage): Buffer {
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
	const message = [MatBofEof.BOF, msg.src, msg.dst, msg.token, payload.length, msgTypeStatus, ...payload]
	message.push(calcChecksum(message), MatBofEof.EOF)
	return Buffer.from(message)
}

export class MatApi {
	#token: Token = new Token(0)
	#logger!: Logger
	public mat!: MatDevice
	public messages: Map<number, MatMessage> = new Map<number, MatMessage>()
	constructor(mat: MatDevice, logger: Logger) {
		this.mat = mat
		this.#logger = logger
	}

	/**
	 * Build message object with all required elements. Adds to this.messages map
	 * @param src Defaults to MatSrc.PC
	 * @param dst Defaults to MatDst.Device
	 * @param token Defaults to new token number
	 * @param Type Defaults to MatMsgType.CMD
	 * @param status Defaults to MatMsgStatus.OK
	 * @param cmd Command to be sent
	 * @param subCmd SubCommand to be sent, only relevant for Antenna Commands
	 * @param payload Payload data. Leave empty for queries
	 * @returns MatMessage object with all data elements required to build a message buffer to be TX'd
	 */

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

	/**
	 * Build MAT Open command
	 * @param password 0 to 8 char to be sent
	 */

	public open(password: string = ''): Buffer {
		const payload: number[] = []
		const pwdLength = password.substring(0, 8).length
		for (let i = 0; i < pwdLength; i++) {
			payload.push(password.charCodeAt(i))
		}
		const msg = this.getMessage({ cmd: MatCmd.OPEN, payload: payload })
		return buildMessage(msg)
	}

	/**
	 * Build MAT Close command
	 */

	public close(): Buffer {
		const msg = this.getMessage({ cmd: MatCmd.CLOSE })
		return buildMessage(msg)
	}

	/**
	 * Build MAT ID command, queries device ID
	 */

	public id(): Buffer {
		const msg = this.getMessage({ cmd: MatCmd.ID })
		return buildMessage(msg)
	}

	/**
	 * Build MAT Serial command, queries device serial number
	 */

	public serial(): Buffer {
		const msg = this.getMessage({ cmd: MatCmd.SERIAL })
		return buildMessage(msg)
	}

	/**
	 * Build MAT APP_VER command, queries device firmware versions
	 */

	public appver(): Buffer {
		const msg = this.getMessage({ cmd: MatCmd.APP_VER })
		return buildMessage(msg)
	}

	/**
	 * Build MAT name command, read/write device or zone name
	 * @param zone Device/Zone to operate against
	 * @param name Optional, include to set name. Up to 8 char
	 */

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

	/**
	 * Build MAT Display command, to read / write the display parameters
	 * @param options.timeout Timeout in Seconds (0-255)
	 * @param options.brightness Brightness (0-255)
	 */

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

	/**
	 * Build MAT Lock command, to read / write the lock parameter
	 * @param options.lock Set True to lock the panel
	 */

	public lock(options?: { lock: boolean }): Buffer {
		const payload: number[] = []
		if (options) {
			payload.push(Number(options.lock))
		}
		const msg = this.getMessage({ cmd: MatCmd.LOCK, payload: payload })
		return buildMessage(msg)
	}

	/**
	 * Build MAT Message command, to flash the display of the Device display, and optionally to write a message to the display
	 * @param options.blink Set True if the message has to be shown together with the flashing of the display
	 * @param options.message Optional. string of a message to be displayed, which disappears after any action of the user on keys / encoder, or sending a subsequent command that has an empty payload (no message). There are no cancellations of the message managed by timing.
	 */

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

	/**
	 * Build MAT Temp command, to read of the internal temperature of the device
	 */

	public temp(): Buffer {
		const msg = this.getMessage({ cmd: MatCmd.TEMP })
		return buildMessage(msg)
	}

	/**
	 * Build MAT Voltage command, to read the voltages in the Device
	 */

	public voltage(): Buffer {
		const msg = this.getMessage({ cmd: MatCmd.VOLTAGE })
		return buildMessage(msg)
	}

	/**
	 * Build MAT Save_Param command, to write all the parameters into the memory of Device
	 */

	public saveParam(): Buffer {
		const msg = this.getMessage({ cmd: MatCmd.SAVE_PAR })
		return buildMessage(msg)
	}

	/**
	 * Build MAT Status command, to read the parameters from the MAT244/MAT288. This command can be done also if the communication with the Device is not opened yet with an OPEN command.
	 */

	public status(): Buffer {
		const msg = this.getMessage({ cmd: MatCmd.STATUS })
		return buildMessage(msg)
	}

	/**
	 * Build MAT Auto_Status command, to request the activation / deactivation of automatic status transmission from the Device. When the AUTOSTATUS is enabled, the MAT244/MAT288 sends the STATUS information xx ms set on the request. Wisycom suggest to use a value higher than 20ms (standard value for MAT244/MAT288 is 32ms)
	 *
	 * @param enable to enable/disable auto_status. Defaults to true
	 * @param interval to set the time interval in mS. Defaults to 32
	 */

	public autostatus(enable: boolean = true, interval: number = 32): Buffer {
		const payload: number[] = [Number(enable)]
		let data = interval < 20 ? 20 : Math.round(interval)
		const byte1 = data & 255
		data >>= 8
		payload.push(byte1)
		payload.push(data)
		const msg = this.getMessage({ cmd: MatCmd.AUTO_STATUS, payload: payload })
		return buildMessage(msg)
	}

	/**
	 * Build MAT Antenna command with Matrix Subcommand
	 *
	 * @param options.selection select the matrix configuration. MAT288 0= 8:1; 1= 8:4; 2= 2x4:2; MAT244 0= 8x1; 1= 8:4; 2= 4:2
	 */

	public antennaMatrix(options?: { selection: AntennaMatrixChoices }): Buffer {
		const payload: number[] = []
		if (options) {
			payload.push(options.selection)
		}
		const msg = this.getMessage({ cmd: MatCmd.ANTENNA, subCmd: SubCmdAntenna.MATRIX, payload: payload })
		return buildMessage(msg)
	}

	/**
	 * Build MAT Antenna command with Activate Subcommand
	 *
	 * @param zone Antenna Zone
	 * @param options.activation Enable or Disable Zone
	 */

	public antennaActivate(zone: MatDstZones, options?: { activation: MatBooleanChoices }): Buffer {
		const payload: number[] = []
		if (options) {
			payload.push(options.activation)
		}
		const msg = this.getMessage({ cmd: MatCmd.ANTENNA, subCmd: SubCmdAntenna.ACTIVATE, dst: zone, payload: payload })
		return buildMessage(msg)
	}

	/**
	 * Build MAT Antenna command with Diversity Subcommand
	 *
	 * @param zone Antenna Zone
	 * @param options.diversity A, B, AB
	 */

	public antennaDiversity(zone: MatDstZones, options?: { diversity: AntennaDiversityChoices }): Buffer {
		const payload: number[] = []
		if (options) {
			payload.push(options.diversity)
		}
		const msg = this.getMessage({ cmd: MatCmd.ANTENNA, subCmd: SubCmdAntenna.DIVERSITY, dst: zone, payload: payload })
		return buildMessage(msg)
	}

	/**
	 * Build MAT Antenna command with Boost Subcommand
	 *
	 * @param zone Antenna Zone
	 * @param options.boost Off, On, High per antenna
	 */

	public antennaBoost(zone: MatDstZones, options?: { boost: AntennaBoostChoices }): Buffer {
		const payload: number[] = []
		if (options) {
			payload.push(options.boost)
		}
		const msg = this.getMessage({ cmd: MatCmd.ANTENNA, subCmd: SubCmdAntenna.BOOST, dst: zone, payload: payload })
		return buildMessage(msg)
	}

	/**
	 * Build MAT Antenna command with Gain Subcommand
	 *
	 * @param zone Antenna Zone
	 * @param Options If undefined message is a Get, if defined message is a Set
	 * @param options.selection Diversity Selection A | B
	 * @param options.attenuation 0 to 63
	 */

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

	/**
	 * Build MAT Antenna command with Boost_Diag Subcommand to read the boosts voltage and current
	 *
	 * @param zone Antenna Zone
	 */

	public antennaBoostDiag(zone: MatDstZones): Buffer {
		const payload: number[] = []
		const msg = this.getMessage({ cmd: MatCmd.ANTENNA, subCmd: SubCmdAntenna.BOOST_DIAG, dst: zone, payload: payload })
		return buildMessage(msg)
	}

	/**
	 * Handle returned message from MAT
	 *
	 */

	public parseResponse(msg: Buffer): void {
		this.#logger.log(LoggerLevel.Debug, `Message Recieved ${msg.toString()}`)
		const data: number[] = []
		// reverse byte stuffing
		for (let i = 0; i < msg.length; i++) {
			if (msg[i] === 0x7d) {
				i += 1
				data.push(msg[i] ^ 0x20)
			} else {
				data.push(msg[i])
			}
		}
		const cleanMsg: Buffer = Buffer.from(data)
		this.#logger.log(LoggerLevel.Console, cleanMsg)
	}
}
