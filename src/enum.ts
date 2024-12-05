export enum matBofEof {
	BOF = 0xc0,
	EOF = 0xc1,
	ESC = 0x7d,
}

export enum matSrc {
	PC = 0xfe,
	Device = 0x00,
}

export enum matDst {
	PC = 0xfe,
	Device = 0x00,
	Zone1 = 0x01,
	Zone2 = 0x02,
	Zone3 = 0x03,
	Zone4 = 0x04,
	Zone5 = 0x05,
	Zone6 = 0x06,
	Zone7 = 0x07,
	Zone8 = 0x08,
}

export enum matMsgType {
	CMD = 0x00,
	CMD_ACK = 0x01,
	EVT = 0x02,
	EVT_ACK = 0x03,
}

export enum matMsgStatus {
	OK = 0x00,
	NET_ERROR = 0x01,
	NET_BUSY = 0x02,
	UNSUPPORTED_SIZE = 0x03,
	WRONG_SIZE = 0x04,
	INVALID_CHECKSUM = 0x05,
	UNKNOWN_CMD = 0x06,
	UNSUPPORTED_CMD = 0x07,
	INVALID_PARAM = 0x08,
	CLOSED = 0x09,
	EXECUTION_FAILURE = 0x0a,
	BUSY = 0x0b, //Assumed doc says 0x0A as above
	DEV_NOT_PRESENT = 0x0c, // Assumed doc says OxOA as above
}

export enum matCmd {
	OPEN = 0x00,
	CLOSE = 0x01,
	ID = 0x02,
	SERIAL = 0x03,
	APP_VER = 0x06,
	STATUS = 0x0d,
	NAME = 0x20,
	DISPLAY = 0x27,
	LOCK = 0x28,
	MESSAGE = 0x2b,
	TEMP = 0x2f,
	VOLTAGE = 0x44,
	SAVE_PAR = 0x59,
	AUTO_STATUS = 0x5a,
	ANTENNA = 0x5d,
}

export interface matMessage {
	src: matSrc
	dst: matDst
	token: number
	type: matMsgType
	status: matMsgStatus
	cmd: matCmd
	payload: number[]
}
