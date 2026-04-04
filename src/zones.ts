import { DropdownChoice } from '@companion-module/base'
import { AntennaMatrixChoices, MatDstZones } from './enum.js'
import { MatApi } from './api.js'

/**
 * Whether a given model + matrix config operates in diversity mode.
 *
 * In diversity mode each zone has an A input AND a B input (two physical
 * antennas per zone). In non-diversity mode each zone has only an A input.
 *
 * MAT288 is ALWAYS in diversity mode — every config switches pairs of inputs
 * to pairs of outputs.
 *
 * MAT244 is only in diversity mode for the 4:2 config. The 8:1 and 8:4
 * configs are single-input (A only). This means:
 *   - zone.antenna.B will always be unused/zero in those modes
 *   - AntennaDiversityChoices.B and .AB are not valid
 *   - Boost options involving B (e.g. _B, AB, HB, AH, HH) are not available
 */
export const IS_DIVERSITY: Record<'MAT244' | 'MAT288', Record<AntennaMatrixChoices, boolean>> = {
	MAT288: {
		[AntennaMatrixChoices.Matrix8_1Driver]: true,
		[AntennaMatrixChoices.Matrix8_4Driver]: true,
		[AntennaMatrixChoices.Matrix2_4_2Driver]: true,
	},
	MAT244: {
		[AntennaMatrixChoices.Matrix8_1Driver]: false,
		[AntennaMatrixChoices.Matrix8_4Driver]: false,
		[AntennaMatrixChoices.Matrix2_4_2Driver]: true,
	},
}

/**
 * Number of active input zones for each matrix configuration, per model.
 *
 * MAT288 — always diversity (A+B per zone), always 8 zones:
 *   8:1   → 8 diversity zones combined to 1 output pair
 *   8:4   → 8 diversity zones distributed to 4 output pairs
 *   2×4:2 → 8 diversity zones in two independent 4:2 combiners (zones 1–4 and 5–8)
 *
 * MAT244 — diversity only in the 4:2 config:
 *   8:1   → 8 single-input (A only) zones combined to 1 output
 *   8:4   → 8 single-input (A only) zones distributed to 4 outputs
 *   4:2   → 4 diversity (A+B) zones to 2 output pairs
 */
const ZONE_COUNT: Record<'MAT244' | 'MAT288', Record<AntennaMatrixChoices, number>> = {
	MAT288: {
		[AntennaMatrixChoices.Matrix8_1Driver]: 8,
		[AntennaMatrixChoices.Matrix8_4Driver]: 8,
		[AntennaMatrixChoices.Matrix2_4_2Driver]: 8,
	},
	MAT244: {
		[AntennaMatrixChoices.Matrix8_1Driver]: 8,
		[AntennaMatrixChoices.Matrix8_4Driver]: 8,
		[AntennaMatrixChoices.Matrix2_4_2Driver]: 4,
	},
}

/**
 * Normalise the model string from the device ID to one of the two known
 * variants. Falls back to MAT288 (the larger device) if unrecognised so
 * that choices are never silently truncated.
 */
function normaliseModel(model: string): 'MAT244' | 'MAT288' {
	if (model.includes('244')) return 'MAT244'
	if (model.includes('288')) return 'MAT288'
	return 'MAT288'
}

/**
 * Returns a `DropdownChoice[]` of the zones that are active given the
 * device's current model and matrix configuration.
 *
 * Zone labels use the name reported by the device when available, falling
 * back to "Zone N" if the device has not yet sent a name or the stored name
 * is still the default 'UNKNOWN'.
 *
 * Intended for use when building Companion action/feedback option lists —
 * call this inside `getActionDefinitions()` / `getFeedbackDefinitions()` so
 * it reflects the current device state at definition-build time.
 *
 * @example
 * const choices = zoneChoices(this.mat)
 * // → [{ id: 1, label: 'Foyer Studio' }, { id: 2, label: 'Zone 2' }, ...]
 */
export function zoneChoices(mat: MatApi): DropdownChoice[] {
	const model = normaliseModel(mat.id.model)
	const config = mat.matrixConfig
	const zoneCount = ZONE_COUNT[model][config] ?? 8

	const choices: DropdownChoice[] = []

	for (let z = 1; z <= zoneCount; z++) {
		const zoneId = z as MatDstZones
		const name = mat.zone(zoneId)?.name
		choices.push({
			id: zoneId,
			label: name && name !== 'UNKNOWN' ? name : `Zone ${z}`,
		})
	}

	return choices
}

/**
 * Returns true if the current device model and matrix configuration
 * operates in diversity mode (i.e. each zone has both an A and B input).
 *
 * Use this to conditionally show/hide B-related options in action and
 * feedback definitions — e.g. diversity selection, B-path boost modes,
 * and B-path gain controls.
 *
 * @example
 * if (isDiversityMode(this.mat)) {
 *   // include AntennaDiversityChoices.B, .AB and B-related boost options
 * }
 */
export function isDiversityMode(mat: MatApi): boolean {
	const model = normaliseModel(mat.id.model)
	const config = mat.matrixConfig
	return IS_DIVERSITY[model][config] ?? true
}
