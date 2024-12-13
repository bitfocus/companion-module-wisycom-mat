import {
	MatDstZones,
	MatVersionType,
	AntennaMatrixChoices,
	AntennaDiversityChoices,
	AntennaBoostChoices,
	AntennaAlarmLed,
	AntennaZoneColors,
} from './enum.js'

export interface MatId {
	model: string
	option: string
	class: number
	hwRev: number
}

export interface Versions {
	type: MatVersionType
	minor: number
	major: number
	muProcessor: number
}

export interface Leds {
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

export interface RfLevels {
	a1: number
	b1: number
	a2: number
	b2: number
}

export interface Temps {
	main: number
	rxA: number
	rxB: number
}

export interface Voltages {
	ext: number
	_8mv: number
	_5mv: number
	_12mv: number
}

export interface AntennaLeds {
	pendingEvents: boolean
	pendingErrors: boolean
	alarmBoost: AntennaAlarmLed
	zone: AntennaZoneColors
}

export interface AntennaDetails {
	voltage: number
	current: number
	gain: number
}

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

export interface MatDisplay {
	timeout: number
	brightness: number
}

export interface device {
	id?: MatId
	serial?: string
	version?: Versions
	name?: string
	display?: MatDisplay
	blink?: boolean
	message?: string
	temp?: Temps
	voltage?: Voltages
	leds?: Leds
	rf?: RfLevels
	zones: Map<MatDstZones, AntennaZone>
	matrixConfig?: AntennaMatrixChoices
}

/**
 * Create data model for MAT with Getters & Setters.
 * Data elements initalised as required via getters
 *
 */

export class MatDevice {
	#device: device = {
		zones: new Map<MatDstZones, AntennaZone>(),
	}
	constructor() {}

	public get id(): MatId {
		if (this.#device.id) return this.#device.id
		return (this.#device.id = {
			model: 'UNKNOWN',
			option: '',
			class: 0,
			hwRev: 0,
		})
	}

	public set model(id: MatId) {
		this.#device.id = id
	}

	public get serial(): string {
		return this.#device.serial === undefined ? (this.#device.serial = 'UNKNOWN') : this.#device.serial
	}

	public set serial(serial: string) {
		this.#device.serial = serial.substring(0, 10)
	}

	public get versions(): Versions {
		if (this.#device.version) return this.#device.version
		return (this.#device.version = {
			type: MatVersionType.RELEASE,
			minor: 0,
			major: 0,
			muProcessor: 0,
		})
	}

	public set versions(ver: Versions) {
		this.#device.version = ver
	}

	public get name(): string {
		if (this.#device.name) return this.#device.name
		return (this.#device.name = 'UNKNOWN')
	}

	public set name(name: string) {
		this.#device.name = name.substring(0, 8)
	}

	public get display(): MatDisplay {
		if (this.#device.display) return this.#device.display
		return (this.#device.display = {
			brightness: 0,
			timeout: 0,
		})
	}

	public set display(disp: MatDisplay) {
		this.#device.display = disp
	}

	public get blink(): boolean {
		return this.#device.blink ?? false
	}

	public set blink(blink: boolean) {
		this.#device.blink = blink
	}

	public get message(): string {
		return this.#device.message ?? ''
	}

	public set message(msg: string) {
		this.#device.message = msg.substring(0, 40)
	}

	public get temp(): Temps {
		if (this.#device.temp) return this.#device.temp
		return (this.#device.temp = {
			main: 0,
			rxA: 0,
			rxB: 0,
		})
	}

	public set temp(tmp: Temps) {
		this.#device.temp = tmp
	}

	public get voltage(): Voltages {
		if (this.#device.voltage) return this.#device.voltage
		return (this.#device.voltage = {
			ext: 0,
			_12mv: 0,
			_8mv: 0,
			_5mv: 0,
		})
	}

	public set voltage(volts: Voltages) {
		this.#device.voltage = volts
	}

	public get leds(): Leds {
		if (this.#device.leds) return this.#device.leds
		return (this.#device.leds = {
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
		})
	}

	public set leds(leds: Leds) {
		this.#device.leds = leds
	}

	public get rfLevels(): RfLevels {
		if (this.#device.rf) return this.#device.rf
		return (this.#device.rf = {
			a1: 0,
			a2: 0,
			b1: 0,
			b2: 0,
		})
	}

	public set rfLevels(rf: RfLevels) {
		this.#device.rf = rf
	}

	public get matrixConfig(): AntennaMatrixChoices {
		if (this.#device.matrixConfig) return this.#device.matrixConfig
		return (this.#device.matrixConfig = AntennaMatrixChoices.Matrix8_1Driver)
	}

	public set matrixConfig(cfg: AntennaMatrixChoices) {
		this.#device.matrixConfig = cfg
	}

	public getZone(zone: MatDstZones): AntennaZone {
		if (this.#device.zones.has(zone)) return this.#device.zones.get(zone) as AntennaZone
		const newZone: AntennaZone = {
			name: 'UNKNOWN',
			leds: {
				pendingErrors: false,
				pendingEvents: false,
				alarmBoost: AntennaAlarmLed.OFF,
				zone: AntennaZoneColors.OFF,
			},
			active: false,
			diversity: AntennaDiversityChoices.AB,
			boost: AntennaBoostChoices.OFF,
			antenna: {
				A: {
					voltage: 0,
					current: 0,
					gain: 0,
				},
				B: {
					voltage: 0,
					current: 0,
					gain: 0,
				},
			},
		}
		this.#device.zones.set(zone, newZone)
		return newZone
	}

	public setZoneName(zoneId: MatDstZones, name: string): void {
		const zone = this.getZone(zoneId)
		zone.name = name
		this.#device.zones.set(zoneId, zone)
	}

	public setZoneLeds(zoneId: MatDstZones, leds: AntennaLeds): void {
		const zone = this.getZone(zoneId)
		zone.leds = leds
		this.#device.zones.set(zoneId, zone)
	}

	public setZoneActive(zoneId: MatDstZones, active: boolean): void {
		const zone = this.getZone(zoneId)
		zone.active = active
		this.#device.zones.set(zoneId, zone)
	}

	public setZoneDiversity(zoneId: MatDstZones, diversity: AntennaDiversityChoices): void {
		const zone = this.getZone(zoneId)
		zone.diversity = diversity
		this.#device.zones.set(zoneId, zone)
	}

	public setZoneBoost(zoneId: MatDstZones, boost: AntennaBoostChoices): void {
		const zone = this.getZone(zoneId)
		zone.boost = boost
		this.#device.zones.set(zoneId, zone)
	}

	public setAntennaGain(zoneId: MatDstZones, antenna: 'A' | 'B', gain: number): void {
		const zone = this.getZone(zoneId)
		zone.antenna[antenna].gain = gain
		this.#device.zones.set(zoneId, zone)
	}

	public setAntennaBoostDiag(zoneId: MatDstZones, antenna: 'A' | 'B', voltage: number, current: number): void {
		const zone = this.getZone(zoneId)
		zone.antenna[antenna].voltage = voltage
		zone.antenna[antenna].current = current
		this.#device.zones.set(zoneId, zone)
	}
}
