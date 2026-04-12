import type { MatApi, TypedDropdownChoice } from './api.js'

/**
 * Reserved characters for special use in MAT messages
 *
 */

type EnumDropdownChoice<T extends number> = TypedDropdownChoice<T>

export enum MatBofEof {
	BOF = 0xc0,
	EOF = 0xc1,
	ESC = 0x7d,
}

/**
 * Mat App Version Type
 *
 */

export enum MatVersionType {
	DEBUG = 0x64,
	RELEASE = 0x72,
	PRODUCTION_RELEASE = 0xff,
}

/**
 * Origin of message
 *
 */

export enum MatSrc {
	PC = 0xfe,
	Device = 0x00,
}

/**
 * Destination of message
 *
 */

export enum MatDst {
	PC = 0xfe,
	DEVICE = 0x00,
	ZONE1 = 0x01,
	ZONE2 = 0x02,
	ZONE3 = 0x03,
	ZONE4 = 0x04,
	ZONE5 = 0x05,
	ZONE6 = 0x06,
	ZONE7 = 0x07,
	ZONE8 = 0x08,
}

/**
 * Destination of message, limited to Antenna zones
 *
 */

export type MatDstZones = Exclude<MatDst, MatDst.PC | MatDst.DEVICE>

/**
 * Message Type: Command, Event, and their ACKs
 *
 */

export enum MatMsgType {
	CMD = 0x00,
	CMD_ACK = 0x01,
	EVT = 0x02,
	EVT_ACK = 0x03,
}

/**
 * Message Status
 *
 */

export enum MatMsgStatus {
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
	DEV_NOT_PRESENT = 0x0c, // Assumed doc says 0x0A as above
}

/**
 * MAT Commands
 *
 */

export enum MatCmd {
	OPEN = 0x00,
	CLOSE = 0x01,
	ID = 0x02,
	SERIAL = 0x03,
	APP_VER = 0x06,
	STATUS = 0x0d,
	CLEAR = 0x0e,
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

/**
 * MAT Antenna Sub Commands
 *
 */

export enum SubCmdAntenna {
	MATRIX = 0x00,
	ACTIVATE = 0x01,
	DIVERSITY = 0x02,
	BOOST = 0x03,
	GAIN = 0x04,
	BOOST_DIAG = 0x06,
}

/**
 * MAT Boolean to Hex Mapping
 *
 */

export enum MatBooleanChoices {
	TRUE = 0x01,
	FALSE = 0x00,
}

/**
 * Antenna Matrix Configuration
 *
 */

export enum AntennaMatrixChoices {
	Matrix8_1Driver = 0x00,
	Matrix8_4Driver = 0x01,
	Matrix2_4_2Driver = 0x02,
}

export const ANTENNA_MATRIX_CHOICES: Record<'MAT244' | 'MAT288', EnumDropdownChoice<AntennaMatrixChoices>[]> = {
	MAT288: [
		{ id: AntennaMatrixChoices.Matrix8_1Driver, label: 'Diversity Combiner 8:1 (+7dB)' },
		{ id: AntennaMatrixChoices.Matrix8_4Driver, label: 'Diversity Combiner 8:4 (0dB)' },
		{ id: AntennaMatrixChoices.Matrix2_4_2Driver, label: '2× Diversity Combiner 4:2' },
	],
	MAT244: [
		{ id: AntennaMatrixChoices.Matrix8_1Driver, label: 'Combiner 8:1 (+7dB)' },
		{ id: AntennaMatrixChoices.Matrix8_4Driver, label: 'Combiner 8:4 (0dB)' },
		{ id: AntennaMatrixChoices.Matrix2_4_2Driver, label: 'Diversity Combiner 4:2 (+7dB)' },
	],
}

export function antennaMatrixChoices(mat: MatApi): EnumDropdownChoice<AntennaMatrixChoices>[] {
	const model = mat.id.model.includes('244') ? 'MAT244' : 'MAT288'
	return ANTENNA_MATRIX_CHOICES[model]
}

/**
 * Antenna Diversity Choices
 *
 */

export enum AntennaDiversityChoices {
	A = 0x00,
	B = 0x01,
	AB = 0x02,
}

export const ANTENNA_DIVERSITY_CHOICES = [
	{ id: AntennaDiversityChoices.A, label: 'A' },
	{ id: AntennaDiversityChoices.B, label: 'B' },
	{ id: AntennaDiversityChoices.AB, label: 'A+B' },
] as const satisfies EnumDropdownChoice<AntennaDiversityChoices>[]

/**
 * Antenna Boost Choices
 *
 */

export enum AntennaBoostChoices {
	OFF = 0x00,
	A_ = 0x01,
	_B = 0x02,
	AB = 0x03,
	H_ = 0x04,
	_H = 0x05,
	HB = 0x06,
	AH = 0x07,
	HH = 0x08,
}

export const ANTENNA_BOOST_CHOICES = [
	{ id: AntennaBoostChoices.OFF, label: 'Off' },
	{ id: AntennaBoostChoices.A_, label: 'A' },
	{ id: AntennaBoostChoices._B, label: 'B' },
	{ id: AntennaBoostChoices.AB, label: 'A+B' },
	{ id: AntennaBoostChoices.H_, label: 'High A' },
	{ id: AntennaBoostChoices._H, label: 'High B' },
	{ id: AntennaBoostChoices.HB, label: 'High A + B' },
	{ id: AntennaBoostChoices.AH, label: 'A + High B' },
	{ id: AntennaBoostChoices.HH, label: 'High A + High B' },
] as const satisfies EnumDropdownChoice<AntennaBoostChoices>[]

// needs to be filtered when in Non diversity modes

type AntennaBoostChoice = { id: AntennaBoostChoices; label: string }

export function antennaBoostChoices(isDiversity: boolean): EnumDropdownChoice<AntennaBoostChoices>[] {
	if (isDiversity) return ANTENNA_BOOST_CHOICES

	return ANTENNA_BOOST_CHOICES.filter(
		(choice: AntennaBoostChoice) =>
			choice.id === AntennaBoostChoices.OFF ||
			choice.id === AntennaBoostChoices.H_ ||
			choice.id === AntennaBoostChoices.A_,
	)
}

/**
 * Antenna Gain, Select A or B inputs
 *
 */

export enum AntennaGainDiversity {
	A = 0x00,
	B = 0x01,
}

export const ANTENNA_GAIN_DIVERSITY_CHOICES = [
	{ id: AntennaGainDiversity.A, label: 'A' },
	{ id: AntennaGainDiversity.B, label: 'B' },
] as const satisfies EnumDropdownChoice<AntennaGainDiversity>[]

export enum AntennaZoneColors {
	OFF = 0x00,
	RED = 0x01,
	GREEN = 0x02,
	BLUE = 0x03,
}

export enum AntennaAlarmLed {
	OFF = 0x00,
	ERROR = 0x01,
	WARNING = 0x02,
}
