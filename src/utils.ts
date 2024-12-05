import { WisyComMATInstance } from './main.js'
import { matBofEof, matSrc, matDst, matMsgStatus, matMsgType } from './enum.js'

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

export function buildMessage(
	src: matSrc,
	dst: matDst,
	token: number,
	type: matMsgType,
	status: matMsgStatus,
	payload: number[],
): Buffer {
	const msgTypeStatus = type >> (6 + status)
	const stuffedPayload = payload.map((byte) => byteStuffing(byte)).flat()
	let message = [matBofEof.BOF, src, dst, token, stuffedPayload.length, msgTypeStatus, ...stuffedPayload]
	const checksum = calcChecksum(message)
	message = [...message, checksum, matBofEof.EOF]
	return Buffer.from(message)
}

export function parseResponse(msg: Buffer, self: WisyComMATInstance): void {
	self.log('debug', `Message Recieved ${msg.toString()}`)
}
