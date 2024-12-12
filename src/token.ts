export class Token {
	#token: number

	constructor(val: number = 0) {
		this.#token = Math.round(val)
		this.#token = this.#token > 254 ? 254 : this.#token < 0 ? 0 : this.#token
	}

	/**
	 * @returns current token value
	 *
	 */

	public get currentToken(): number {
		return this.#token
	}

	/**
	 * @returns incremented token value
	 *
	 */

	public get newToken(): number {
		return (this.#token = this.#token >= 254 ? 0 : this.#token + 1)
	}

	/**
	 * Resets token value to 0
	 *
	 */

	public get resetToken(): number {
		return (this.#token = 0)
	}

	/**
	 * Sets token value
	 * @param val Integer in range 0 - 254
	 *
	 */

	public set setToken(val: number) {
		this.#token = Math.round(val)
		this.#token = this.#token > 254 ? 254 : this.#token < 0 ? 0 : this.#token
	}
}
