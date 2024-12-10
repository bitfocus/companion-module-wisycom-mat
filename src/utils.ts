import { WisyComMATInstance } from './main.js'

export function parseResponse(msg: Buffer, self: WisyComMATInstance): void {
	self.log('debug', `Message Recieved ${msg.toString()}`)
	const data: number[] = []
	for (let i = 0; i < msg.length; i++) {
		if (msg[i] === 0x7d) {
			// reverse byte stuffing
			i += 1
			data.push(msg[i] ^ 0x20)
		} else {
			data.push(msg[i])
		}
	}
	const cleanMsg: Buffer = Buffer.from(data)
	console.log(cleanMsg)
}
